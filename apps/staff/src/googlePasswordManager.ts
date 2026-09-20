import { registerPlugin } from "@capacitor/core";

type SavePasswordOptions = {
  username: string;
  password: string;
};

type GooglePasswordManagerPlugin = {
  savePassword(options: SavePasswordOptions): Promise<{ saved: boolean }>;
};

export const googlePasswordManager = registerPlugin<GooglePasswordManagerPlugin>("GooglePasswordManager");
