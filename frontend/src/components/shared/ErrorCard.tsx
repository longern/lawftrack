import { Card, CardContent, Typography } from "@mui/material";

interface ErrorCardProps {
  message: string;
}

function ErrorCard({ message }: ErrorCardProps) {
  return (
    <Card
      sx={{
        border: "1px solid rgba(211, 47, 47, 0.18)",
        backgroundColor: "rgba(211, 47, 47, 0.04)",
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
