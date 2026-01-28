'use client';

import { Box, Text } from '@chakra-ui/react';

export default function ThermalReceipt() {
  return (
    <Box
      id="print-root"
      bg="gray.50"
      borderRadius="20px"
      border="1px dashed"
      borderColor="gray.300"
      p={6}
    >
      <Text fontSize="lg" fontWeight="600" mb={2}>
        Visualização térmica
      </Text>
      <Text color="gray.500">
        Conteúdo ajustado para impressão em rolo térmico. Personalize depois conforme a necessidade.
      </Text>
    </Box>
  );
}
