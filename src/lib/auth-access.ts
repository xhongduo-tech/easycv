import { defaultAc } from "better-auth/plugins/admin/access";

export const authRoles = {
  user: defaultAc.newRole({ user: [], session: [] }),
  admin: defaultAc.newRole({
    user: ["list", "set-role", "ban"],
    session: [],
  }),
};
