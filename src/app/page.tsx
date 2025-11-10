import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";

export default function Home() {
  return (
    <div className="h-full overflow-auto flex flex-col">
      <MarketingNav />
      {/* Hero Banner with Gradient Background */}
      <section className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white py-24 px-8">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">FireFly Analytics</span>
          </h1>
          <p className="text-2xl text-white/90 max-w-2xl mx-auto">
            A personalized Databricks experience powered by Databricks itself
          </p>
        </div>
      </section>

      {/* Description Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-background py-16 px-8">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="space-y-4 text-lg text-muted-foreground">
            <p>
              Experience the power of Databricks with a completely customized interface
              tailored to your workflow. Same backend, any frontend you can imagine.
            </p>
            <p>
              Choose your authentication method and get started with your personalized
              Databricks environment.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <main className="flex-1 px-8 py-12">
        <div className="max-w-4xl mx-auto text-center space-y-12">

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 items-center justify-center">
            <Link
              href="/sso-spn"
              className="group relative inline-flex items-center justify-center px-10 py-6 text-lg font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl transition-all duration-200 shadow-xl hover:shadow-2xl hover:scale-105 w-full sm:w-auto"
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold text-xl">SSO Mapped to SPN</span>
                <span className="text-sm text-white/90">
                  Tenant IDP with shared SPN
                </span>
              </div>
            </Link>

            <Link
              href="/federation"
              className="group relative inline-flex items-center justify-center px-10 py-6 text-lg font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all duration-200 shadow-xl hover:shadow-2xl hover:scale-105 w-full sm:w-auto"
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold text-xl">Custom Federation</span>
                <span className="text-sm text-white/90">
                  Multi-tenant with your identity
                </span>
              </div>
            </Link>

            <Link
              href="/databricks-idp"
              className="group relative inline-flex items-center justify-center px-10 py-6 text-lg font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-all duration-200 shadow-xl hover:shadow-2xl hover:scale-105 w-full sm:w-auto"
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold text-xl">Databricks Identity</span>
                <span className="text-sm text-white/90">
                  Per-workspace authentication
                </span>
              </div>
            </Link>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="bg-gradient-to-b from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Organization Support</h3>
              <p className="text-muted-foreground">
                Multi-tenant architecture with organization management
              </p>
            </div>
            <div className="p-8 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Flexible Authentication</h3>
              <p className="text-muted-foreground">
                Choose between custom federation or Databricks native auth
              </p>
            </div>
            <div className="p-8 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Full Databricks Power</h3>
              <p className="text-muted-foreground">
                Access all Databricks features through your personalized interface
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section - Embedding Databricks Apps */}
      <section className="py-16 px-8 bg-white dark:bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Embedding Databricks Apps w/o SSO
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Embed Databricks apps like the VSCode editor directly into your
              custom interface without requiring users to go through Databricks SSO login
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div className="border-l-4 border-orange-500 pl-6 py-2">
                <h3 className="text-xl font-semibold mb-2">What It Does</h3>
                <p className="text-muted-foreground">
                  The Go proxy server acts as a secure intermediary between your
                  Next.js application and Databricks Lakehouse Apps. It encrypts
                  OAuth tokens, handles HTTP/HTTPS requests, and provides full
                  bidirectional WebSocket support for real-time features like
                  terminal sessions and collaborative editing.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-6 py-2">
                <h3 className="text-xl font-semibold mb-2">Token Encryption</h3>
                <p className="text-muted-foreground">
                  OAuth access tokens are encrypted using AES-256-GCM in Next.js,
                  embedded in proxy URLs, and decrypted server-side by the Go
                  proxy. This ensures tokens never appear in plain text in the
                  browser, protecting against token theft and unauthorized access.
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-6 py-2">
                <h3 className="text-xl font-semibold mb-2">Iframe Embedding</h3>
                <p className="text-muted-foreground">
                  Lakehouse Apps are embedded as iframes with carefully configured
                  sandbox attributes and permissions. The iframe loads through the
                  proxy URL, which handles authentication transparently while
                  maintaining strict security controls and cross-origin isolation.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="border-l-4 border-purple-500 pl-6 py-2">
                <h3 className="text-xl font-semibold mb-2">WebSocket Support</h3>
                <p className="text-muted-foreground">
                  The proxy automatically detects WebSocket upgrade requests and
                  establishes bidirectional connections. Messages are forwarded
                  between the browser and Databricks in real-time, enabling
                  interactive features like terminal sessions, live debugging,
                  and Language Server Protocol for code intelligence.
                </p>
              </div>

              <div className="border-l-4 border-pink-500 pl-6 py-2">
                <h3 className="text-xl font-semibold mb-2">Secure by Design</h3>
                <p className="text-muted-foreground">
                  The architecture ensures OAuth tokens are never exposed to
                  browser JavaScript. All authentication happens server-side,
                  with encrypted tokens in transit and CORS headers properly
                  configured for controlled access between origins.
                </p>
              </div>

              <div className="border-l-4 border-indigo-500 pl-6 py-2">
                <h3 className="text-xl font-semibold mb-2">Future: postMessage API</h3>
                <p className="text-muted-foreground">
                  Future enhancements will enable direct communication between
                  the parent page and embedded apps using the postMessage API.
                  This will allow theme synchronization, command execution,
                  state extraction, and event forwarding for deeper integration.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center shrink-0">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3">Technical Deep Dive</h3>
                <p className="text-muted-foreground mb-4">
                  Learn about the complete architecture, including URL patterns,
                  encryption algorithms, WebSocket proxying, iframe security
                  controls, and deployment strategies.
                </p>
                <Link
                  href="/docs/architecture/lakehouse-apps-proxy"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-yellow-600 transition-all shadow-lg hover:shadow-xl"
                >
                  View Full Documentation
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-100 dark:bg-slate-900 py-8 text-center text-sm text-muted-foreground border-t">
        <p>&copy; 2025 FireFly Analytics. Powered by Databricks.</p>
      </footer>
    </div>
  );
}
