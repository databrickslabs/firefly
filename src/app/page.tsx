import Link from "next/link";

export default function Home() {
  return (
    <div className="h-full overflow-auto flex flex-col">
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
              tailored to your workflow. Same backend, revolutionary frontend.
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

      <footer className="bg-slate-100 dark:bg-slate-900 py-8 text-center text-sm text-muted-foreground border-t">
        <p>&copy; 2025 FireFly Analytics. Powered by Databricks.</p>
      </footer>
    </div>
  );
}
