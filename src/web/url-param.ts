import { useEffect, useState } from "react";

/** A query parameter of the current URL, updated on every same-document navigation. */
export function useUrlParam(name: string): string | null {
  const [value, setValue] = useState(() => new URL(location.href).searchParams.get(name));
  useEffect(() => {
    const update = () => setValue(new URL(location.href).searchParams.get(name));
    update();
    navigation.addEventListener("currententrychange", update);
    return () => navigation.removeEventListener("currententrychange", update);
  }, [name]);
  return value;
}
