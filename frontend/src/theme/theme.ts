import type {} from "@mui/x-data-grid/themeAugmentation";
import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#67e8c2",
      light: "#8ef0d3",
      dark: "#3fb092",
    },
    secondary: {
      main: "#8aa4b8",
    },
    background: {
      default: "#0b1117",
      paper: "#121b24",
    },
    text: {
      primary: "#eef4f7",
      secondary: "#8fa1b2",
    },
    divider: "rgba(143, 161, 178, 0.16)",
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    h1: {
      fontSize: "2.2rem",
      lineHeight: 1.02,
      letterSpacing: "-0.05em",
      fontWeight: 700,
    },
    h2: {
      fontSize: "1.1rem",
      letterSpacing: "-0.03em",
      fontWeight: 700,
    },
    h4: {
      letterSpacing: "-0.03em",
      fontWeight: 700,
    },
    overline: {
      fontWeight: 700,
      letterSpacing: "0.12em",
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 18px 40px rgba(3, 8, 12, 0.28)",
          borderRadius: 6,
          border: "1px solid rgba(143, 161, 178, 0.14)",
          backgroundColor: "#121b24",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#121b24",
          border: "1px solid rgba(143, 161, 178, 0.12)",
          boxShadow: "0 18px 40px rgba(3, 8, 12, 0.22)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: alpha("#dbe7f0", 0.02),
          "& fieldset": {
            borderColor: "rgba(143, 161, 178, 0.18)",
          },
          "&:hover fieldset": {
            borderColor: "rgba(143, 161, 178, 0.3)",
          },
          "&.Mui-focused fieldset": {
            borderColor: "#67e8c2",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: "none",
          fontWeight: 600,
          boxShadow: "none",
        },
        contained: {
          color: "#08110f",
          background: "linear-gradient(135deg, #67e8c2 0%, #7dd3fc 100%)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          letterSpacing: "0.03em",
          borderRadius: 999,
        },
        outlined: {
          borderColor: "rgba(103, 232, 194, 0.35)",
          color: "#c8f7ea",
          backgroundColor: "rgba(103, 232, 194, 0.06)",
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          backgroundColor: "#121b24",
          borderRadius: 6,
          color: "#eef4f7",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: "1px solid rgba(143, 161, 178, 0.12)",
          background:
            "linear-gradient(180deg, rgba(12,18,26,0.98) 0%, rgba(14,21,30,0.98) 100%)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: "rgba(11, 17, 23, 0.82)",
          backdropFilter: "blur(16px)",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          color: "#d9e5ec",
          "&.Mui-selected": {
            backgroundColor: "rgba(103, 232, 194, 0.12)",
            color: "#eef4f7",
          },
          "&.Mui-selected:hover": {
            backgroundColor: "rgba(103, 232, 194, 0.16)",
          },
        },
      },
    },
  },
});
