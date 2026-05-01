import type { ReactNode } from "react";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import FileUploadRounded from "@mui/icons-material/FileUploadRounded";
import PaidRounded from "@mui/icons-material/PaidRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import TableRowsRounded from "@mui/icons-material/TableRowsRounded";
import ViewCarouselRounded from "@mui/icons-material/ViewCarouselRounded";
import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useI18n } from "@/i18n";

export type ViewMode =
  | "load"
  | "dashboard"
  | "movements"
  | "review"
  | "settings"
  | "budgets";

const drawerWidth = 232;
const appBarHeight = 64;

export function AppShell({
  children,
  viewMode,
  onViewChange,
}: {
  children: ReactNode;
  viewMode: ViewMode;
  onViewChange: (nextView: ViewMode) => void;
}) {
  const es = useI18n();
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
        overflowX: "hidden",
      }}
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
          <Button
            color="primary"
            startIcon={<FileUploadRounded />}
            variant="contained"
            onClick={() => onViewChange("load")}
          >
            {es.load.headerAction}
          </Button>
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
              selected={viewMode === "load"}
              sx={{ borderRadius: 1.5 }}
              onClick={() => onViewChange("load")}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <FileUploadRounded
                  color={viewMode === "load" ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText primary={es.nav.load} />
            </ListItemButton>
            <ListItemButton
              selected={viewMode === "dashboard"}
              sx={{ borderRadius: 1.5, mt: 0.5 }}
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
            <ListItemButton
              selected={viewMode === "budgets"}
              sx={{ borderRadius: 1.5, mt: 0.5 }}
              onClick={() => onViewChange("budgets")}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <PaidRounded
                  color={viewMode === "budgets" ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText primary={es.nav.budgets} />
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
          // Critical: cap the main column to "viewport − drawer width" so its
          // children can't push the page wider than the screen on md+. Below
          // md the drawer is hidden so the main can take 100%.
          width: { xs: "100%", md: `calc(100% - ${drawerWidth}px)` },
          minWidth: 0,
          overflowX: "hidden",
        }}
      >
        <Toolbar sx={{ minHeight: `${appBarHeight}px !important` }} />
        <Box sx={{ px: { xs: 1.5, md: 2.5 }, py: 2, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
