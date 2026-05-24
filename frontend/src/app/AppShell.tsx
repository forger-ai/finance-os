import { useState, type ReactNode } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import CategoryRounded from "@mui/icons-material/CategoryRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import FileUploadRounded from "@mui/icons-material/FileUploadRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import PaidRounded from "@mui/icons-material/PaidRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import TableRowsRounded from "@mui/icons-material/TableRowsRounded";
import ViewCarouselRounded from "@mui/icons-material/ViewCarouselRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import {
  AppBar,
  Badge,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useI18n } from "@/i18n";

export type ViewMode =
  | "load"
  | "dashboard"
  | "movements"
  | "review"
  | "categories"
  | "settings"
  | "budgets";

const drawerWidth = 232;
const appBarHeight = 64;

const mainNavItems = [
  { view: "load", icon: FileUploadRounded, label: "load" },
  { view: "dashboard", icon: DashboardRounded, label: "dashboard" },
  { view: "movements", icon: TableRowsRounded, label: "movements" },
  { view: "review", icon: ViewCarouselRounded, label: "review" },
  { view: "budgets", icon: PaidRounded, label: "budgets" },
  { view: "categories", icon: CategoryRounded, label: "categories" },
] as const;

export function AppShell({
  children,
  viewMode,
  pendingReviewCount,
  onAddManualMovement,
  onViewChange,
}: {
  children: ReactNode;
  viewMode: ViewMode;
  pendingReviewCount: number;
  onAddManualMovement: () => void;
  onViewChange: (nextView: ViewMode) => void;
}) {
  const es = useI18n();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const reviewTooltip =
    pendingReviewCount > 0
      ? es.topActions.reviewPendingTooltip(pendingReviewCount)
      : es.topActions.reviewCompleteTooltip;
  const handleViewChange = (nextView: ViewMode) => {
    setMobileDrawerOpen(false);
    onViewChange(nextView);
  };
  const drawerContent = (
    <Stack sx={{ height: "100%" }}>
      <List sx={{ px: 1.5, py: 1.5 }}>
        {mainNavItems.map(({ view, icon: Icon, label }, index) => (
          <ListItemButton
            key={view}
            selected={viewMode === view}
            sx={{ borderRadius: 1.5, mt: index === 0 ? 0 : 0.5 }}
            onClick={() => handleViewChange(view)}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>
              <Icon color={viewMode === view ? "primary" : "inherit"} />
            </ListItemIcon>
            <ListItemText primary={es.nav[label]} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      <List sx={{ px: 1.5, pb: 1.5 }}>
        <ListItemButton
          selected={viewMode === "settings"}
          sx={{ borderRadius: 1.5 }}
          onClick={() => handleViewChange("settings")}
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
  );

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
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <IconButton
              aria-label="Abrir menú"
              color="primary"
              edge="start"
              onClick={() => setMobileDrawerOpen(true)}
              sx={{ display: { xs: "inline-flex", md: "none" } }}
            >
              <MenuRounded />
            </IconButton>
            <Typography
              noWrap
              sx={{ fontSize: 22, fontWeight: 800, letterSpacing: 0 }}
            >
              {es.app.title}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Tooltip title={es.topActions.loadTooltip}>
              <IconButton
                aria-label={es.topActions.loadTooltip}
                color="primary"
                onClick={() => handleViewChange("load")}
              >
                <FileUploadRounded />
              </IconButton>
            </Tooltip>
            <Tooltip title={es.topActions.addManualTooltip}>
              <IconButton
                aria-label={es.topActions.addManualTooltip}
                color="primary"
                onClick={onAddManualMovement}
              >
                <AddRounded />
              </IconButton>
            </Tooltip>
            <Tooltip title={reviewTooltip}>
              <IconButton
                aria-label={reviewTooltip}
                color={pendingReviewCount > 0 ? "warning" : "success"}
                onClick={() => handleViewChange("review")}
              >
                {pendingReviewCount > 0 ? (
                  <Badge
                    badgeContent={pendingReviewCount}
                    color="warning"
                    max={99}
                  >
                    <WarningAmberRounded />
                  </Badge>
                ) : (
                  <CheckCircleRounded />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: drawerWidth,
            pt: `${appBarHeight}px`,
          },
        }}
        ModalProps={{ keepMounted: true }}
        variant="temporary"
      >
        {drawerContent}
      </Drawer>

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
        {drawerContent}
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
