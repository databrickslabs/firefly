export default function FederationDashboard() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Federation Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold mb-2">Workspaces</h3>
            <p className="text-sm text-muted-foreground">
              Manage your Databricks workspaces
            </p>
          </div>
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold mb-2">Organizations</h3>
            <p className="text-sm text-muted-foreground">
              View and manage organizations
            </p>
          </div>
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold mb-2">Settings</h3>
            <p className="text-sm text-muted-foreground">
              Configure your preferences
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
