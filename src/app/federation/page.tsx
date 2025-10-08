export default function FederationPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Custom Federation
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Multi-tenant authentication with your custom identity provider
          </p>
        </div>

        <div className="max-w-2xl mx-auto p-10 border-2 border-blue-200 dark:border-blue-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="text-center space-y-6">
            <p className="text-muted-foreground">
              Federation authentication coming soon. Configure your custom identity provider to enable multi-tenant authentication.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
