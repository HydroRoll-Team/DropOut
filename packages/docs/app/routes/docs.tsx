import { redirect } from "react-router";
import { i18n, resolveLocale } from "@/lib/i18n";
import type { Route } from "./+types/docs";

export function loader({ params }: Route.LoaderArgs) {
  const lang = resolveLocale(params.lang);

  if (lang === null) {
    throw new Response("Not found", { status: 404 });
  }

  // 如果没有语言参数或是默认语言，重定向到 /docs/manual/getting-started
  if (lang === i18n.defaultLanguage) {
    return redirect("/docs/manual/getting-started");
  }

  // 其他语言重定向到 /:lang/docs/manual/getting-started
  return redirect(`/${lang}/docs/manual/getting-started`);
}
