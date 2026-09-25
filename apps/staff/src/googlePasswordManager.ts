import { registerPlugin } from "@capacitor/core";

type SavePasswordOptions = {
  username: string;
  password: string;
};

type SavedPassword = {
  username: string;
  password: string;
};

type GooglePasswordManagerPlugin = {
  savePassword(options: SavePasswordOptions): Promise<{ saved: boolean }>;
  getPassword(): Promise<SavedPassword>;
};

export const googlePasswordManager = registerPlugin<GooglePasswordManagerPlugin>("GooglePasswordManager");
