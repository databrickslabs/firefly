"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavCustomization } from "@/hooks/use-nav-customization";
import {
  Home,
  Database,
  Code,
  MonitorPlay,
  LayoutDashboard,
  GitBranch,
  Upload,
  Briefcase,
  ShieldCheck,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";

interface CustomizeNavModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}

const sidebarNavEntries: { id: string; icon: LucideIcon }[] = [
  { id: "Home", icon: Home },
  { id: "Catalog", icon: Database },
  { id: "SQL", icon: Code },
  { id: "IDE", icon: MonitorPlay },
  { id: "Embedded Dashboard", icon: LayoutDashboard },
  { id: "Pipelines", icon: GitBranch },
  { id: "Import Data", icon: Upload },
  { id: "Jobs (Coming Soon)", icon: Briefcase },
  { id: "Admin", icon: ShieldCheck },
];

const userMenuEntries: { id: string }[] = [
  { id: "Account Details" },
  { id: "Profile Settings" },
  { id: "Preferences" },
  { id: "Organization Settings" },
];

export function CustomizeNavModal({
  open,
  onOpenChange,
  orgId,
}: CustomizeNavModalProps) {
  const {
    sidebarItems,
    userMenuItems,
    setSidebarItemVisible,
    setUserMenuItemVisible,
    resetToDefaults,
  } = useNavCustomization(orgId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Navigation</DialogTitle>
          <DialogDescription>
            Show or hide items in your sidebar and user menu.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Sidebar Navigation */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Sidebar Navigation
              </h4>
              {sidebarNavEntries.map(({ id, icon: Icon }) => (
                <div key={id} className="flex items-center justify-between">
                  <Label
                    htmlFor={`sidebar-${id}`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {id}
                  </Label>
                  <Switch
                    id={`sidebar-${id}`}
                    size="sm"
                    checked={sidebarItems[id] !== false}
                    onCheckedChange={(checked) =>
                      setSidebarItemVisible(id, checked as boolean)
                    }
                  />
                </div>
              ))}
            </div>

            {/* User Menu */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                User Menu
              </h4>
              {userMenuEntries.map(({ id }) => (
                <div key={id} className="flex items-center justify-between">
                  <Label htmlFor={`menu-${id}`} className="cursor-pointer">
                    {id}
                  </Label>
                  <Switch
                    id={`menu-${id}`}
                    size="sm"
                    checked={userMenuItems[id] !== false}
                    onCheckedChange={(checked) =>
                      setUserMenuItemVisible(id, checked as boolean)
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
