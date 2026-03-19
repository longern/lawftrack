import { Box, Typography } from "@mui/material";

interface FeatureRowProps {
  title: string;
  body: string;
}

function FeatureRow({ title, body }: FeatureRowProps) {
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {body}
      </Typography>
    </Box>
  );
}

export default FeatureRow;
