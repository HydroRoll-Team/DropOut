pub struct Launcher {
    pub config: crate::launcher::config::Config,
}

impl Launcher {
    pub fn new(config: crate::launcher::config::Config) -> Self {
        Launcher { config }
    }

    pub fn launch(&self) {
        println!("启动游戏，用户名: {}", self.config.username);
        println!(
            "分辨率: {}x{}",
            self.config.resolution.0, self.config.resolution.1
        );
    }
}
