use std::path::PathBuf;

pub fn windows_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    let program_files =
        std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
    let program_files_x86 = std::env::var("ProgramFiles(x86)")
        .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

    let mut win_paths = vec![];
    for base in &[&program_files, &program_files_x86, &local_app_data] {
        win_paths.push(format!("{}\\Java", base));
        win_paths.push(format!("{}\\Eclipse Adoptium", base));
        win_paths.push(format!("{}\\AdoptOpenJDK", base));
        win_paths.push(format!("{}\\Microsoft\\jdk", base));
        win_paths.push(format!("{}\\Zulu", base));
        win_paths.push(format!("{}\\Amazon Corretto", base));
        win_paths.push(format!("{}\\BellSoft\\LibericaJDK", base));
        win_paths.push(format!("{}\\Programs\\Eclipse Adoptium", base));
    }

    for base in &win_paths {
        let base_path = PathBuf::from(base);
        if base_path.exists() {
            if let Ok(entries) = std::fs::read_dir(&base_path) {
                for entry in entries.flatten() {
                    let java_path = entry.path().join("bin\\java.exe");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }
    }

    candidates
}
