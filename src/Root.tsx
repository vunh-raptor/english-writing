import { StoreProvider } from "./store/StoreContext";
import { App } from "./App";

/** Client root: wires the store provider around the app. */
export default function Root() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
