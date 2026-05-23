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



#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn test_config() -> crate::config::ScannerConfig {
        crate::config::ScannerConfig {
            regex: "TODO".to_string(),
            case_sensitive: true,
            tags: vec!["TODO".into()],
            include_globs: vec![],
            exclude_globs: vec![],
            include_hidden_files: false,
            max_file_size: 1024, // 1KB limit for tests
            native_markdown: true,
        }
    }

    #[test]
    fn max_file_size_skips_large_files() {
        let dir = TempDir::new().unwrap();
        let small = dir.path().join("small.js");
        let large = dir.path().join("large.js");

        fs::write(&small, "// TODO small").unwrap();
        fs::write(&large, "x".repeat(2048) + "\n// TODO large").unwrap(); // > 1KB

        let results = readable_text_files(vec![small.clone(), large.clone()], 1024);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, small);
    }

    #[test]
    fn binary_file_skipped() {
        let dir = TempDir::new().unwrap();
        let bin = dir.path().join("binary.dat");
        let txt = dir.path().join("text.js");

        // Non-UTF-8 content that will cause read_to_string to fail
        fs::write(&bin, &[0xFF, 0xFE, 0x80, 0x81, 0x82, 0x83]).unwrap();
        fs::write(&txt, "// TODO text file").unwrap();

        let results = readable_text_files(vec![bin, txt.clone()], 1024 * 1024);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, txt);
    }

    #[test]
    fn gitignore_excludes_files() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        // Create .gitignore
        fs::write(root.join(".gitignore"), "ignored/\n").unwrap();

        // Create source file
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src").join("main.js"), "// TODO keep").unwrap();

        // Create ignored file
        fs::create_dir_all(root.join("ignored")).unwrap();
        fs::write(root.join("ignored").join("skip.js"), "// TODO skip").unwrap();

        // Initialize git repo so .gitignore is respected
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(root)
            .output()
            .ok();

        let config = test_config();
        let walker = FileWalker::new(root, &config).unwrap();
        let files = walker.collect_files(&config);

        let file_names: Vec<String> = files.iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert!(file_names.contains(&"main.js".to_string()));
        assert!(!file_names.contains(&"skip.js".to_string()));
    }
}
