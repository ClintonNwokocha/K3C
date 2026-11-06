import { MotionContext } from "./motionContextValue";

export function MotionProvider({ value, children }) {
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
