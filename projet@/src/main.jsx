import React from "react";
import ReactDOM from "react-dom/client";
import "bulma/css/bulma.min.css";
import { Routeur } from "./Routeur.jsx";
import { initPresenceWatcher } from "./firebase";

initPresenceWatcher();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Routeur />
  </React.StrictMode>
);
