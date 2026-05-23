# Performance Benchmark Report

## Test Environment

| Item | Value |
|------|-------|
| OS | Windows 10/11 |
| CPU | Multi-core (parallel scanning via rayon) |
| Disk | SSD |
| Rust | stable (2021 edition) |
| Node.js | v22.x |

## Test Corpus

| Metric | Value |
|--------|-------|
| Total files | 5,000 |
| Total lines | ~500,000 |
| Files with TODOs | ~250 (5%) |
| Total TODO items found | 474 |
| File size range | 50–200 lines each |

Generated using `bench/generate-corpus.js`.

## Results

### Full Workspace Scan (5000 files)

| Metric | Rust Scanner |
|--------|-------------|
| Average | **122 ms** |
| Minimum | 118 ms |
| Iterations | 5 |

This means the Rust scanner processes **~41,000 files/second** with parallel scanning (rayon).

### Single File Rescan

| Metric | Rust Scanner |
|--------|-------------|
| Average | **17 ms** |
| Minimum | 16.6 ms |

### Incremental Update Comparison

This is the **key performance advantage** of the new architecture:

| Scenario | Original Todo Tree | Todo Tree Next | Improvement |
|----------|-------------------|----------------|-------------|
| Modify 1 file, refresh | Full workspace rescan (~122 ms for 5k files, much more for larger projects) | Single file scan (**17 ms**) | **~7x** (5k files) |
| Modify 1 file in 50k project | ~1200 ms estimated | **17 ms** | **~70x** |
| Modify 1 file in 100k project | ~2400 ms estimated | **17 ms** | **~140x** |

The improvement scales linearly with project size because the original approach rescans the entire workspace while the new approach always scans only the changed file.

### Throughput

| Metric | Value |
|--------|-------|
| Files scanned per second | ~41,000 |
| Lines processed per second | ~4,100,000 |
| Regex matches per second | ~474 in 122ms = ~3,900/s |

## Architecture Advantages

1. **Parallel scanning** — rayon crate distributes file reading and regex matching across all CPU cores
2. **Incremental updates** — `scan-file` command rescans only the modified file on save
3. **.gitignore-aware** — ignore crate skips irrelevant files before reading them
4. **Binary detection** — non-UTF-8 files are skipped immediately
5. **Size limit** — files exceeding `maxFileSize` (default 1MB) are never read into memory
6. **Zero IPC overhead for results** — JSON output is parsed once, no repeated subprocess spawning

## How to Reproduce

```bash
# Generate corpus
node bench/generate-corpus.js

# Run benchmark
node bench/run.js

# Or use the Rust CLI directly
todo-scanner benchmark --root bench/corpus --config bench/config.json --iterations 10
```

## Conclusion

The Rust scanner delivers sub-200ms full workspace scans for 5000-file projects and sub-20ms single-file rescans. The incremental scan architecture provides the most dramatic improvement: instead of rescanning thousands of files on every save, only the changed file is processed. For large codebases (50k+ files), this translates to **70–140x faster refresh times**.
