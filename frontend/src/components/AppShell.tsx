import type { ReactNode } from "react";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import TableRowsRounded from "@mui/icons-material/TableRowsRounded";
import ViewCarouselRounded from "@mui/icons-material/ViewCarouselRounded";
import {
  AppBar,
  Box,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { es } from "@/i18n/es";

export type ViewMode = "dashboard" | "movements" | "review" | "settings";

const drawerWidth = 232;
const appBarHeight = 64;

export function AppShell({
  children,
  summaryLabel,
  viewMode,
  onViewChange,
}: {
  children: ReactNode;
  summaryLabel: string;
  viewMode: ViewMode;
  onViewChange: (nextView: ViewMode) => void;
}) {
  return (
    <Box
      sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}
    >
      <AppBar
        color="inherit"
        elevation={0}
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: "rgba(11, 17, 23, 0.82)",
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(16px)",
        }}
      >
        <Toolbar
          sx={{
            minHeight: `${appBarHeight}px !important`,
            px: { xs: 2, md: 3 },
            justifyContent: "space-between",
          }}
        >
          <Typography
            sx={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.04em" }}
          >
            {es.app.title}
          </Typography>
          <Chip
            color="primary"
            label={summaryLabel}
            size="small"
            variant="outlined"
          />
        </Toolbar>
      </AppBar>

      <Drawer
        open
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: drawerWidth,
            top: 0,
            height: "100%",
            paddingTop: `${appBarHeight}px`,
            borderTop: 0,
          },
        }}
        variant="permanent"
      >
        <Stack sx={{ height: "100%" }}>
          <List sx={{ px: 1.5, py: 1.5 }}>
            <ListItemButton
              selected={viewMode === "dashboard"}
              sx={{ borderRadius: 1.5 }}
              onClick={() => onViewChange("dashboard")}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <DashboardRounded
                  color={viewMode === "dashboard" ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText primary={es.nav.dashboard} />
            </ListItemButton>
            <ListItemButton
              selected={viewMode === "movements"}
              sx={{ borderRadius: 1.5, mt: 0.5 }}
              onClick={() => onViewChange("movements")}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <TableRowsRounded
                  color={viewMode === "movements" ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText primary={es.nav.movements} />
            </ListItemButton>
            <ListItemButton
              selected={viewMode === "review"}
              sx={{ borderRadius: 1.5, mt: 0.5 }}
              onClick={() => onViewChange("review")}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <ViewCarouselRounded
                  color={viewMode === "review" ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText primary={es.nav.review} />
            </ListItemButton>
          </List>

          <Box sx={{ flexGrow: 1 }} />

          <List sx={{ px: 1.5, pb: 1.5 }}>
            <ListItemButton
              selected={viewMode === "settings"}
              sx={{ borderRadius: 1.5 }}
              onClick={() => onViewChange("settings")}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <SettingsRounded
                  color={viewMode === "settings" ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText primary={es.nav.settings} />
            </ListItemButton>
          </List>
        </Stack>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: "100%",
        }}
      >
        <Toolbar sx={{ minHeight: `${appBarHeight}px !important` }} />
        <Box sx={{ px: { xs: 1.5, md: 2.5 }, py: 2 }}>{children}</Box>
      </Box>
    </Box>
  );
}
