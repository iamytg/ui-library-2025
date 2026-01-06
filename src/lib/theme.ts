import type { ThemeOptions } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import { deepmerge } from "@mui/utils";

export const getTheme = (options?: ThemeOptions) => {
  return createTheme(
    deepmerge(
      {
        cssVariables: true,
      },
      options
    )
  );
};
