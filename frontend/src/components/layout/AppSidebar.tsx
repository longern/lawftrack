import { Avatar, Box, Divider, List, ListItemButton, ListItemIcon, ListItemText, Paper, Typography } from "@mui/material";
import { NAV_ITEMS } from "../../constants/app";
import type { NavView } from "../../types/app";

interface AppSidebarProps {
  activeView: NavView;
  onSelect: (view: NavView) => void;
}

function AppSidebar({ activeView, onSelect }: AppSidebarProps) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          px: 2.5,
          py: 3,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Avatar sx={{ bgcolor: "primary.main", width: 42, height: 42 }}>L</Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            lawftune
          </Typography>
          <Typography variant="body2" color="text.secondary">
            PC console navigation
          </Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.id}
            selected={activeView === item.id}
            onClick={() => onSelect(item.id)}
            sx={{
              mb: 0.75,
              minHeight: 52,
              borderRadius: 3,
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: 700 } }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 2 }}>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            color: "common.white",
            background: "linear-gradient(135deg, #1f4b99, #0f766e)",
          }}
        >
          <Typography variant="overline" sx={{ opacity: 0.8 }}>
            Navigation
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.5 }}>
            Desktop Sidebar
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
            移动端使用底部三栏，PC 端保留更适合控制台的侧边导航。
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}

export default AppSidebar;
