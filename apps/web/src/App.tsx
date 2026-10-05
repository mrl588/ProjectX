import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  if (me.isLoading) {
    return <div className="grid h-full place-items-center text-muted">Opening your day…</div>;
  }

  const signedIn = me.isSuccess;
  return (
    <Routes>
      <Route path="/login" element={signedIn ? <Navigate to="/" replace /> : <LoginPage onDone={() => me.refetch()} />} />
      <Route path="/" element={signedIn ? <HomePage onSignOut={() => me.refetch()} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
