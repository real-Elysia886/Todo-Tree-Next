use crate::config::ScannerConfig;
use anyhow::{Context, Result};
use globset::{Glob, GlobSet, GlobSetBuilder};
use ignore::WalkBuilder;
use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};

pub struct FileWalker {
    root: PathBuf,
    include_globs: GlobSet,
    exclude_globs: GlobSet,
}

impl FileWalker {
    pub fn new(root: &Path, config: &ScannerConfig) -> Result<Self> {
        Ok(Self {
            root: root.to_path_buf(),
            include_globs: build_globset(&config.include_globs)?,
            exclude_globs: build_globset(&config.exclude_globs)?,
        })
    }

    pub fn collect_files(&self, config: &ScannerConfig) -> Vec<PathBuf> {
        let mut builder = WalkBuilder::new(&self.root);
        builder
            .standard_filters(true)
            .hidden(!config.include_hidden_files)
            .git_ignore(true)
            .git_exclude(true)
            .git_global(true)
            .follow_links(false);

        builder
            .build()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
            .map(|entry| entry.into_path())
            .filter(|path| self.is_included(path))
            .collect()
    }

    pub fn is_included(&self, path: &Path) -> bool {
        let rel = path.strip_prefix(&self.root).unwrap_or(path);
        let absolute = normalize(path);
        let relative = normalize(rel);

        let included = self.include_globs.is_empty()
            || self.include_globs.is_match(&absolute)
            || self.include_globs.is_match(&relative);

        let excluded = self.exclude_globs.is_match(&absolute)
            || self.exclude_globs.is_match(&relative)
            || relative.starts_with(".git/")
            || relative.contains("/.git/")
            || relative.starts_with("node_modules/")
            || relative.contains("/node_modules/")
            || relative.starts_with("dist/")
            || relative.starts_with("target/");

        included && !excluded
    }
}

pub fn readable_text_files(paths: Vec<PathBuf>, max_file_size: u64) -> Vec<(PathBuf, String)> {
    paths
        .into_par_iter()
        .filter_map(|path| {
            let metadata = fs::metadata(&path).ok()?;
            if metadata.len() > max_file_size {
                return None;
            }
            let content = fs::read_to_string(&path).ok()?;
            Some((path, content))
        })
        .collect()
}

pub fn read_single_file(path: &Path, max_file_size: u64) -> Result<Option<String>> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("failed to read file metadata {}", path.display()))?;
    if metadata.len() > max_file_size {
        return Ok(None);
    }
    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::InvalidData => Ok(None),
        Err(error) => Err(error).with_context(|| format!("failed to read file {}", path.display())),
    }
}

fn build_globset(globs: &[String]) -> Result<GlobSet> {
    let mut builder = GlobSetBuilder::new();

    for glob in globs.iter().filter(|g| !g.trim().is_empty()) {
        let glob = glob.trim().trim_start_matches('!');
        builder.add(Glob::new(&normalize_glob(glob))?);
    }

    builder.build().context("failed to build glob set")
}

fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_glob(glob: &str) -> String {
    glob.replace('\\', "/")
}

