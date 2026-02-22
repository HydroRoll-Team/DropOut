import type { Route } from './+types/home';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { i18n } from '@/lib/i18n';

const texts = {
  en: {
    hero: {
      title: 'DropOut Minecraft Launcher',
      subtitle: 'Modern. Reproducible. Developer-Grade.',
      description: 'Built with Tauri v2 and Rust for native performance and minimal resource usage',
      start: 'Get Started',
      development: 'Development',
    },
    features: {
      items: [
        { title: 'High Performance', desc: 'Built with Rust and Tauri for minimal resource usage and fast startup times' },
        { title: 'Modern UI', desc: 'Clean, distraction-free interface with Svelte 5 and Tailwind CSS 4' },
        { title: 'Secure Auth', desc: 'Microsoft OAuth 2.0 with device code flow and offline mode support' },
        { title: 'Mod Loaders', desc: 'Built-in support for Fabric and Forge with automatic version management' },
        { title: 'Java Management', desc: 'Auto-detection and integrated downloader for Adoptium JDK/JRE' },
        { title: 'Instance System', desc: 'Isolated game environments with independent configs and mods' },
      ]
    },
    why: {
      title: 'Why DropOut?',
      items: [
        { q: 'Your instance worked yesterday but broke today?', a: '→ DropOut makes it traceable.' },
        { q: 'Sharing a modpack means zipping gigabytes?', a: '→ DropOut shares exact dependency manifests.' },
        { q: 'Java, loader, mods, configs drift out of sync?', a: '→ DropOut locks them together.' },
      ]
    },
    cta: {
      title: 'Ready to get started?',
      desc: 'Check out the documentation to learn more about DropOut',
      button: 'Read the Docs',
    }
  },
  zh: {
    hero: {
      title: 'DropOut Minecraft 启动器',
      subtitle: '现代、可复现、开发者级',
      description: '基于 Tauri v2 和 Rust 构建，拥有原生性能和极低的资源占用',
      start: '开始使用',
      development: '参与开发',
    },
    features: {
      items: [
        { title: '高性能', desc: '使用 Rust 和 Tauri 构建，资源占用最小，启动速度极快' },
        { title: '现代化界面', desc: '简洁、无干扰的界面，使用 Svelte 5 和 Tailwind CSS 4' },
        { title: '安全认证', desc: '支持微软 OAuth 2.0 设备代码流和离线模式' },
        { title: '模组支持', desc: '内置 Fabric 和 Forge 支持，自动管理版本' },
        { title: 'Java 管理', desc: '自动检测并集成 Adoptium JDK/JRE 下载器' },
        { title: '实例系统', desc: '独立的游戏环境，独立的配置和模组' },
      ]
    },
    why: {
      title: '为什么选择 DropOut？',
      items: [
        { q: '你的实例昨天还能用，今天就坏了？', a: '→ DropOut 让它可追溯。' },
        { q: '分享模组包意味着打包数GB的文件？', a: '→ DropOut 分享精确的依赖清单。' },
        { q: 'Java、加载器、模组、配置不同步？', a: '→ DropOut 将它们锁定在一起。' },
      ]
    },
    cta: {
      title: '准备好开始了？',
      desc: '查看文档以了解更多关于 DropOut 的信息',
      button: '阅读文档',
    }
  }
};

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: 'DropOut - Modern Minecraft Launcher' },
    { name: 'description', content: 'A modern, reproducible, and developer-grade Minecraft launcher built with Tauri v2 and Rust.' },
  ];
}

export default function Home({ params }: Route.ComponentProps) {
  const lang = (params.lang as 'en' | 'zh') || i18n.defaultLanguage;
  const t = texts[lang];
  
  // 默认语言（zh）不显示前缀，其他语言显示前缀
  const isDefaultLocale = lang === i18n.defaultLanguage;
  const localePrefix = isDefaultLocale ? '' : `/${lang}`;

  return (
    <HomeLayout {...baseOptions(lang)}>
      <div className="container max-w-6xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            {t.hero.title}
          </h1>
          <p className="text-xl text-fd-muted-foreground mb-2">
            {t.hero.subtitle}
          </p>
          <p className="text-lg text-fd-muted-foreground max-w-2xl mx-auto mb-8">
            {t.hero.description}
          </p>
          <div className="flex gap-4 justify-center mb-12">
            <a
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-3 transition-colors cursor-pointer"
              href={`${localePrefix}/docs`}
            >
              {t.hero.start}
            </a>
            <a
              className="bg-fd-secondary hover:bg-fd-secondary/80 text-fd-secondary-foreground font-semibold rounded-lg px-6 py-3 transition-colors cursor-pointer border border-blue-600/50"
              href={`${localePrefix}/docs/development`}
            >
               {t.hero.development}
            </a>
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
          {t.features.items.map((item, i) => (
             <div key={i} className="p-6 rounded-lg border border-blue-600/20 bg-fd-card hover:border-blue-600/50 transition-colors">
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-sm text-fd-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Why DropOut Section */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-6">{t.why.title}</h2>
          <div className="max-w-3xl mx-auto space-y-4 text-left">
            {t.why.items.map((item, i) => (
              <div key={i} className="p-4 rounded-lg bg-fd-muted/50">
                <p className="text-fd-foreground">
                  <span className="font-semibold">{item.q}</span>
                  <br />
                  <span className="text-fd-muted-foreground">{item.a}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center py-12 px-6 rounded-xl bg-gradient-to-r from-blue-600/10 to-cyan-500/10 border border-blue-600/20">
          <h2 className="text-3xl font-bold mb-4">{t.cta.title}</h2>
          <p className="text-lg text-fd-muted-foreground mb-6">
            {t.cta.desc}
          </p>
          <a
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-8 py-3 transition-colors"
            href={`${localePrefix}/docs/manual/getting-started`}
          >
            {t.cta.button}
          </a>
        </div>
      </div>
    </HomeLayout>
  );
}
