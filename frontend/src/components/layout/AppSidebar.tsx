import {
  Avatar,
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import type { NavItem, NavView } from "../../types/app";

interface AppSidebarProps {
  activeView: NavView;
  items: NavItem[];
  onSelect: (view: NavView) => void;
}

function AppSidebar({ activeView, items, onSelect }: AppSidebarProps) {
  const primaryItems = items.filter((item) => item.id !== "me");
  const meItem = items.find((item) => item.id === "me");

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{ px: 2.5, py: 3, display: "flex", alignItems: "center", gap: 1.5 }}
      >
        <Avatar sx={{ bgcolor: "primary.main", width: 42, height: 42 }}>
          L
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            lawftrack
          </Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {primaryItems.map((item) => (
          <ListItemButton
            key={item.id}
            selected={activeView === item.id}
            onClick={() => onSelect(item.id)}
            sx={{ mb: 0.75, minHeight: 52, borderRadius: 3 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              slotProps={{ primary: { fontWeight: 700 } }}
            />
          </ListItemButton>
        ))}
      </List>
      {meItem ? (
        <>
          <Divider />
          <List sx={{ px: 1.5, py: 2 }}>
            <ListItemButton
              selected={activeView === meItem.id}
              onClick={() => onSelect(meItem.id)}
              sx={{ minHeight: 52, borderRadius: 3 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{meItem.icon}</ListItemIcon>
              <ListItemText
                primary={meItem.label}
                slotProps={{ primary: { fontWeight: 700 } }}
              />
            </ListItemButton>
          </List>
        </>
      ) : null}
    </Box>
  );
}

export default AppSidebar;
