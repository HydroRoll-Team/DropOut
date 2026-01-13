# DropOut - Next Generation Minecraft Launcher

DropOut is a modern, fast, and efficient Minecraft launcher built with the latest web and system technologies. It leverages **Tauri v2** to deliever a lightweight application with a robust **Rust** backend and a reactive **Svelte 5** frontend.

## Features

- **High Performance**: Built with Rust and Tauri for minimal resource usage.
- **Microsoft Authentication**: Secure login support via official Xbox Live & Microsoft OAuth flows.
- **Cross-Platform**: Native support for **Windows**, **Linux**, and **macOS**.
- **Modern UI**: Clean and responsive interface built with Svelte 5 and Tailwind CSS 4.
- **Game Management**:
  - Version isolation and management
  - Efficient asset and library downloading
  - Custom Java arguments support

## Installation

*(Pre-built binaries coming soon to the [Releases](https://github.com/HsiangNianian/DropOut/releases) page)*

## Building from Source

### Prerequisites

1. **Rust**: Install from [rustup.rs](https://rustup.rs/).
2. **Node.js** & **pnpm**: Used for the frontend.
3. **System Dependencies**: Follow the [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/HsiangNianian/DropOut.git
   cd DropOut
   ```
2. **Install Frontend Dependencies**

   ```bash
   cd ui
   pnpm install
   cd ..
   ```
3. **Run in Development Mode**

   ```bash
   # This will start the frontend server and the Tauri app window
   cargo tauri dev
   ```
4. **Build Release Version**

   ```bash
   cargo tauri build
   ```

   The executable will be located in `src-tauri/target/release/`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.
