import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const siteKey = import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY?.trim() || "";

  return new Response(JSON.stringify({ siteKey }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};
