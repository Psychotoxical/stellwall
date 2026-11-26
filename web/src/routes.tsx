import { Navigate, Outlet, type RouteObject } from "react-router";
import { Shell } from "./components/Shell.tsx";
import { useMe, useSetupStatus } from "./session.ts";
import { Setup } from "./pages/Setup.tsx";
import { Login } from "./pages/Login.tsx";
import { Home } from "./pages/Home.tsx";
import { Members } from "./pages/Members.tsx";
import { Account } from "./pages/Account.tsx";
import { More } from "./pages/More.tsx";
import { Shopping } from "./pages/Shopping.tsx";
import { useLive } from "./live.ts";

function RequireMember() {
  const me = useMe();
  const setup = useSetupStatus();
  useLive(!!me.data);
  if (me.isPending) return null;
  if (!me.data) {
    if (setup.isPending) return null;
    return <Navigate to={setup.data?.needed ? "/einrichten" : "/anmelden"} replace />;
  }
  return <Shell />;
}

function PublicOnly() {
  const me = useMe();
  if (me.isPending) return null;
  if (me.data) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.data?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export const routes: RouteObject[] = [
  {
    element: <PublicOnly />,
    children: [
      { path: "/einrichten", element: <Setup /> },
      { path: "/anmelden", element: <Login /> },
    ],
  },
  {
    element: <RequireMember />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/einkauf", element: <Shopping /> },
      { path: "/mehr", element: <More /> },
      { path: "/konto", element: <Account /> },
      { path: "/mitglieder", element: <AdminOnly><Members /></AdminOnly> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
