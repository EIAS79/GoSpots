import React from "react";
import { createRoot } from "react-dom/client";
import { HardwareWorkspace } from "../../src/components/enterprise/hardware-workspace";

const container = document.getElementById("t009-app");
if (!container) throw new Error("T009 test fixture root missing");
createRoot(container).render(<HardwareWorkspace />);
