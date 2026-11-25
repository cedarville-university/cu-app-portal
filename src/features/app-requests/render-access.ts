import { cache } from "react";
import { userHasAdminRole } from "./access";

export const getRenderAdminRole = cache(userHasAdminRole);
