import type { Route } from './+types/home';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { Link } from 'react-router';
import { baseOptions } from '@/lib/layout.shared';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'DropOut - Modern Minecraft Launcher' },
    { name: 'description', content: 'A modern, reproducible, and developer-grade Minecraft launcher built with Tauri v2 and Rust.' },
  ];
}

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="container max-w-6xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            DropOut Minecraft Launcher
          </h1>
          <p className="text-xl text-fd-muted-foreground mb-2">
            Modern. Reproducible. Developer-Grade.
          </p>
          <p className="text-lg text-fd-muted-foreground max-w-2xl mx-auto mb-8">
            Built with Tauri v2 and Rust for native performance and minimal resource usage
          </p>
          <div className="flex gap-4 justify-center mb-12">
            <Link
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
              to="/docs/en"
            >
              Get Started
            </Link>
            <Link
              className="bg-fd-secondary hover:bg-fd-secondary/80 text-fd-secondary-foreground font-semibold rounded-lg px-6 py-3 transition-colors"
              to="/docs/en/features"
            >
              Features
            </Link>
          </div>
        </div>

        {/* Launcher Showcase */}
        <div className="mb-16">
          <div className="rounded-xl overflow-hidden shadow-2xl border border-fd-border">
            <img 
              src="/image.png" 
              alt="DropOut Launcher Interface" 
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-lg border border-fd-border bg-fd-card">
            <div className="text-2xl mb-3">🚀</div>
            <h3 className="font-semibold text-lg mb-2">High Performance</h3>
            <p className="text-sm text-fd-muted-foreground">
              Built with Rust and Tauri for minimal resource usage and fast startup times
            </p>
          </div>
          <div className="p-6 rounded-lg border border-fd-border bg-fd-card">
            <div className="text-2xl mb-3">🎨</div>
            <h3 className="font-semibold text-lg mb-2">Modern UI</h3>
            <p className="text-sm text-fd-muted-foreground">
              Clean, distraction-free interface with Svelte 5 and Tailwind CSS 4
            </p>
          </div>
          <div className="p-6 rounded-lg border border-fd-border bg-fd-card">
            <div className="text-2xl mb-3">🔐</div>
            <h3 className="font-semibold text-lg mb-2">Secure Auth</h3>
            <p className="text-sm text-fd-muted-foreground">
              Microsoft OAuth 2.0 with device code flow and offline mode support
            </p>
          </div>
          <div className="p-6 rounded-lg border border-fd-border bg-fd-card">
            <div className="text-2xl mb-3">🔧</div>
            <h3 className="font-semibold text-lg mb-2">Mod Loaders</h3>
            <p className="text-sm text-fd-muted-foreground">
              Built-in support for Fabric and Forge with automatic version management
            </p>
          </div>
          <div className="p-6 rounded-lg border border-fd-border bg-fd-card">
            <div className="text-2xl mb-3">☕</div>
            <h3 className="font-semibold text-lg mb-2">Java Management</h3>
            <p className="text-sm text-fd-muted-foreground">
              Auto-detection and integrated downloader for Adoptium JDK/JRE
            </p>
          </div>
          <div className="p-6 rounded-lg border border-fd-border bg-fd-card">
            <div className="text-2xl mb-3">📦</div>
            <h3 className="font-semibold text-lg mb-2">Instance System</h3>
            <p className="text-sm text-fd-muted-foreground">
              Isolated game environments with independent configs and mods
            </p>
          </div>
        </div>

        {/* Why DropOut Section */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-6">Why DropOut?</h2>
          <div className="max-w-3xl mx-auto space-y-4 text-left">
            <div className="p-4 rounded-lg bg-fd-muted/50">
              <p className="text-fd-foreground">
                <span className="font-semibold">Your instance worked yesterday but broke today?</span>
                <br />
                <span className="text-fd-muted-foreground">→ DropOut makes it traceable.</span>
              </p>
            </div>
            <div className="p-4 rounded-lg bg-fd-muted/50">
              <p className="text-fd-foreground">
                <span className="font-semibold">Sharing a modpack means zipping gigabytes?</span>
                <br />
                <span className="text-fd-muted-foreground">→ DropOut shares exact dependency manifests.</span>
              </p>
            </div>
            <div className="p-4 rounded-lg bg-fd-muted/50">
              <p className="text-fd-foreground">
                <span className="font-semibold">Java, loader, mods, configs drift out of sync?</span>
                <br />
                <span className="text-fd-muted-foreground">→ DropOut locks them together.</span>
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center py-12 px-6 rounded-xl bg-gradient-to-r from-blue-600/10 to-cyan-500/10 border border-blue-600/20">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-lg text-fd-muted-foreground mb-6">
            Check out the documentation to learn more about DropOut
          </p>
          <Link
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-8 py-3 transition-colors"
            to="/docs/en/getting-started"
          >
            Read the Docs
          </Link>
        </div>
      </div>
    </HomeLayout>
  );
}
