import { createBrowserRouter } from "react-router";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Home } from "./pages/Home";
import { ActiveRecording } from "./pages/ActiveRecording";
import { Viewer } from "./pages/Viewer";


export const router = createBrowserRouter([
  {
    path: "/",
    Component: Login,
  },
  {
    path: "/signup",
    Component: Signup,
  },
  {
    path: "/home",
    Component: Home,
  },
  {
    path: "/recording",
    Component: ActiveRecording,
  },
  {
    path: "/viewer",
    Component: Viewer,
  },
]);
