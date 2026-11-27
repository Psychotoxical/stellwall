import { useEffect } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router";
import { applyWorld } from "./theme/world.ts";
import { Shell } from "./components/Shell.tsx";
import { useMe, useSetupStatus } from "./session.ts";
import { Setup } from "./pages/Setup.tsx";
import { Login } from "./pages/Login.tsx";
import { FirstPassword } from "./pages/FirstPassword.tsx";
import { Home } from "./pages/Home.tsx";
import { Members } from "./pages/Members.tsx";
import { Account } from "./pages/Account.tsx";
import { More } from "./pages/More.tsx";
import { Shopping } from "./pages/Shopping.tsx";
import { Todos } from "./pages/Todos.tsx";
import { Calendar } from "./pages/Calendar.tsx";
import { Birthdays } from "./pages/Birthdays.tsx";
import { Import } from "./pages/Import.tsx";
import { Meals } from "./pages/Meals.tsx";
import { RecipeView } from "./pages/Recipe.tsx";
import { Pantry } from "./pages/Pantry.tsx";
import { MealieSettings } from "./pages/MealieSettings.tsx";
import { Notifications } from "./pages/Notifications.tsx";
import { useLive } from "./live.ts";

function RequireMember() {
  const me = useMe();
  const setup = useSetupStatus();
  useLive(!!me.data);
  // The app takes on the signed-in person's colour world.
  useEffect(() => {
    if (me.data?.world) applyWorld(me.data.world);
  }, [me.data?.world]);
  if (me.isPending) return null;
  if (!me.data) {
    if (setup.isPending) return null;
    return <Navigate to={setup.data?.needed ? "/einrichten" : "/anmelden"} replace />;
  }
  if (me.data.mustChangePassword) return <FirstPassword me={me.data} />;
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
      { path: "/todos", element: <Todos /> },
      { path: "/kalender", element: <Calendar /> },
      { path: "/kalender/geburtstage", element: <Birthdays /> },
      { path: "/kalender/import", element: <Import /> },
      { path: "/essen", element: <Meals /> },
      { path: "/essen/rezept/:slug", element: <RecipeView /> },
      { path: "/essen/grundvorrat", element: <Pantry /> },
      { path: "/benachrichtigungen", element: <Notifications /> },
      { path: "/mealie", element: <AdminOnly><MealieSettings /></AdminOnly> },
      { path: "/mehr", element: <More /> },
      { path: "/konto", element: <Account /> },
      { path: "/mitglieder", element: <AdminOnly><Members /></AdminOnly> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
