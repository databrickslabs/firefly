export default function SsoSpnPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Custom SSO Mapped to SPN
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tenant-based authentication with service principal identity mapping
          </p>
        </div>

        <div className="max-w-2xl mx-auto p-10 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold mb-4">Coming Soon</h2>
            </div>

            <div className="space-y-4 text-muted-foreground">
              <p>
                This authentication method allows you to log in per tenant to your identity provider, then map that identity to a service principal (SPN) in your organization.
              </p>

              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <h3 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                  Key Features:
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>All users in an organization share the same SPN identity</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>Per-tenant IDP authentication with SPN mapping</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>Optional team/group-based SPN assignment</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>Users can be assigned to specific team SPNs for granular access control</span>
                  </li>
                </ul>
              </div>

              <p className="text-sm italic">
                Configuration and setup options will be available soon. Stay tuned!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
