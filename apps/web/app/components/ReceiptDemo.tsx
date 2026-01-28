'use client';

'use client';

import { Button, Container, Heading } from '@chakra-ui/react';
import { useState } from 'react';
import SaleReceiptModal from './SaleReceiptModal';

export default function ReceiptDemo() {
  const [open, setOpen] = useState(false);

  return (
    <Container py={10}>
      <Heading mb={6}>Revendis Web</Heading>
      <Button colorScheme="purple" onClick={() => setOpen(true)}>
        Abrir extrato de venda
      </Button>
      <SaleReceiptModal isOpen={open} onClose={() => setOpen(false)} />
    </Container>
  );
}
