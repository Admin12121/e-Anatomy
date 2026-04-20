import { RouteLoadingState } from "@/components/layout/route-loading-state";

export default function SettingsLoading() {
  return (
    <RouteLoadingState
      title="Loading Settings"
      description="Fetching account preferences and connected authentication methods."
    />
  );
}
