import { definePlugin } from "../../plugin-api.ts";
import { geckoProfile } from "./profile.ts";

export const geckoPlugin = definePlugin({ id: "gecko", repoProfiles: [geckoProfile] });
