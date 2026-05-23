mod config;
mod matcher;
mod output;
mod walker;

use anyhow::{bail, Context, Result};
use config::ScannerConfig;
use matcher::TodoMatcher;
use output::{ScanOutput, TodoItem};
use rayon::prelude::*;
use std::env;
use std::path::{Path, PathBuf};
use std::time::Instant;
use walker::{read_single_file, readable_text_files, FileWalker};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        bail!("missing command: scan-workspace, scan-file, or benchmark");
    }

    let command = args[1].as_str();
    let root = required_arg(&args, "--root")?;
    let config_path = required_arg(&args, "--config")?;
    let config = ScannerConfig::from_path(Path::new(&config_path))?;

    let output = match command {
        "scan-workspace" => scan_workspace(Path::new(&root), &config)?,
        "scan-file" => {
            let file = required_arg(&args, "--file")?;
            scan_file(Path::new(&root), Path::new(&file), &config)?
        }
        "benchmark" => {
            let iterations = optional_arg(&args, "--iterations")
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(5);
            run_benchmark(Path::new(&root), &config, iterations)?
        }
        other => bail!("unknown command {other}"),
    };

    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}

fn scan_workspace(root: &Path, config: &ScannerConfig) -> Result<ScanOutput> {
    let started = Instant::now();
    let root = root
        .canonicalize()
        .with_context(|| format!("failed to canonicalize root {}", root.display()))?;
    let matcher = TodoMatcher::new(config)?;
    let walker = FileWalker::new(&root, config)?;
    let paths = walker.collect_files(config);
    let scanned_files = paths.len();

    let file_items: Vec<Vec<TodoItem>> = readable_text_files(paths, config.max_file_size)
        .into_par_iter()
        .map(|(path, content)| matcher.scan_text(&path, &content))
        .filter(|items| !items.is_empty())
        .collect();

    let matched_files = file_items.len();
    let items = file_items.into_iter().flatten().collect::<Vec<_>>();

    Ok(ScanOutput {
        workspace: clean_path(&root),
        elapsed_ms: started.elapsed().as_millis(),
        scanned_files,
        matched_files,
        total_items: items.len(),
        items,
    })
}

fn scan_file(root: &Path, file: &Path, config: &ScannerConfig) -> Result<ScanOutput> {
    let started = Instant::now();
    let root = root
        .canonicalize()
        .with_context(|| format!("failed to canonicalize root {}", root.display()))?;
    let file = canonicalize_under_root(&root, file)?;
    let walker = FileWalker::new(&root, config)?;

    let items = if walker.is_included(&file) {
        match read_single_file(&file, config.max_file_size)? {
            Some(content) => TodoMatcher::new(config)?.scan_text(&file, &content),
            None => Vec::new(),
        }
    } else {
        Vec::new()
    };

    Ok(ScanOutput {
        workspace: clean_path(&root),
        elapsed_ms: started.elapsed().as_millis(),
        scanned_files: 1,
        matched_files: usize::from(!items.is_empty()),
        total_items: items.len(),
        items,
    })
}

fn clean_path(path: &Path) -> String {
    path.display()
        .to_string()
        .trim_start_matches("\\\\?\\")
        .to_string()
}

fn canonicalize_under_root(root: &Path, file: &Path) -> Result<PathBuf> {
    let file = file
        .canonicalize()
        .with_context(|| format!("failed to canonicalize file {}", file.display()))?;
    if !file.starts_with(root) {
        bail!(
            "refusing to scan file outside root: {} is outside {}",
            file.display(),
            root.display()
        );
    }
    Ok(file)
}

fn required_arg(args: &[String], name: &str) -> Result<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
        .with_context(|| format!("missing required argument {name}"))
}

fn optional_arg(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn run_benchmark(root: &Path, config: &ScannerConfig, iterations: u32) -> Result<ScanOutput> {
    let mut times: Vec<u128> = Vec::with_capacity(iterations as usize);
    let mut last_output = None;

    for _ in 0..iterations {
        let output = scan_workspace(root, config)?;
        times.push(output.elapsed_ms);
        last_output = Some(output);
    }

    let mut output = last_output.unwrap();
    let min = *times.iter().min().unwrap_or(&0);
    let max = *times.iter().max().unwrap_or(&0);
    let avg = times.iter().sum::<u128>() / iterations as u128;

    // Report benchmark stats via elapsed_ms = avg, workspace field carries full stats
    output.elapsed_ms = avg;
    output.workspace = format!(
        "{} [benchmark: {}x, avg={}ms, min={}ms, max={}ms]",
        output.workspace, iterations, avg, min, max
    );

    Ok(output)
}
