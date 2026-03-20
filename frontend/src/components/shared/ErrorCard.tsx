import { Card, CardContent, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

interface ErrorCardProps {
  message: string;
}

function ErrorCard({ message }: ErrorCardProps) {
  return (
    <Card
      sx={{
        border: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.24)}`,
        backgroundColor: (theme) => alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.12 : 0.04),
      }}
    >
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} color="error.main">
          Gateway data could not be loaded
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {message}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default ErrorCard;
