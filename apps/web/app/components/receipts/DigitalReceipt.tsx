'use client';

import { Badge, Box, Divider, Flex, Heading, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { formatCurrency, formatDate } from '../../lib/format';

export type DigitalReceiptData = {
  customer: string;
  issuedAt: string;
  saleDate: string;
  totalAmount: number;
  deliveryStatus: string;
  paymentStatusLabel: 'Pago' | 'Parcial' | 'Pendente';
  installments: Array<{
    id: string;
    title: string;
    method: string;
    status: 'Pago' | 'Pendente';
    amount: number;
    date: string;
  }>;
  summary: {
    original: number;
    discount: number;
    final: number;
    paid: number;
    remaining: number;
  };
  product: {
    name: string;
    quantity: number;
    total: number;
  };
};

export const MOCK_DIGITAL_RECEIPT: DigitalReceiptData = {
  customer: 'Cliente Demo',
  issuedAt: '2026-01-27T00:00:00',
  saleDate: '2026-01-27',
  totalAmount: 1000,
  deliveryStatus: 'Entregue',
  paymentStatusLabel: 'Parcial',
  installments: [
    {
      id: 'installment-1',
      title: 'Parcela 1 de 2',
      method: 'Dinheiro',
      status: 'Pago',
      amount: 500,
      date: '2026-01-27'
    },
    {
      id: 'installment-2',
      title: 'Parcela 2 de 2',
      method: 'Dinheiro',
      status: 'Pendente',
      amount: 500,
      date: '2026-02-27'
    }
  ],
  summary: {
    original: 1000,
    discount: 0,
    final: 1000,
    paid: 500,
    remaining: 500
  },
  product: {
    name: 'teste',
    quantity: 1,
    total: 1000
  }
};

const formatIssueTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}h${minutes}`;
};

const installmentBadgeColor = (status: 'Pago' | 'Pendente') => (status === 'Pago' ? 'green' : 'orange');
const summaryRows = [
  { label: 'Valor original', key: 'original' },
  { label: 'Desconto', key: 'discount' },
  { label: 'Valor final', key: 'final' },
  { label: 'Valor pago', key: 'paid' },
  { label: 'Valor restante', key: 'remaining' }
] as const;

export default function DigitalReceipt({ receipt = MOCK_DIGITAL_RECEIPT }: { receipt?: DigitalReceiptData }) {
  return (
    <Box id="print-root" width="100%">
      <Box
        bg="gray.100"
        borderRadius="2xl"
        p={{ base: 4, md: 6 }}
        border="1px solid"
        borderColor="gray.200"
      >
        <Box
          bg="white"
          borderRadius="2xl"
          border="1px solid"
          borderColor="gray.200"
          p={{ base: 4, md: 6 }}
          boxShadow="0 18px 40px rgba(15, 23, 42, 0.08)"
        >
          <Flex justify="space-between" align="center" mb={2}>
            <Heading size="lg">Resumo da venda</Heading>
            <Badge colorScheme="purple" borderRadius="2xl" px={4} py={3} fontSize="md">
              R
            </Badge>
          </Flex>
          <Text color="gray.500" fontSize="sm">
            Emitido em {formatDate(receipt.issuedAt)} às {formatIssueTime(receipt.issuedAt)} no Revendi Web
          </Text>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacingY={4} spacingX={8} mt={6}>
            <Box>
              <Text color="gray.500" fontSize="xs" textTransform="uppercase" letterSpacing="wide">
                Cliente
              </Text>
              <Text fontWeight="600">{receipt.customer}</Text>
              <Text color="gray.500" fontSize="xs" mt={4} textTransform="uppercase" letterSpacing="wide">
                Valor total
              </Text>
              <Text fontWeight="600">{formatCurrency(receipt.totalAmount)}</Text>
            </Box>
            <Box>
              <Text color="gray.500" fontSize="xs" textTransform="uppercase" letterSpacing="wide">
                Data da venda
              </Text>
              <Text fontWeight="600">{formatDate(receipt.saleDate)}</Text>
              <Text color="gray.500" fontSize="xs" mt={4} textTransform="uppercase" letterSpacing="wide">
                Situação da entrega
              </Text>
              <Badge colorScheme="green" variant="subtle" borderRadius="full" px={3} py={1}>
                {receipt.deliveryStatus}
              </Badge>
            </Box>
          </SimpleGrid>

          <Divider my={4} borderColor="gray.200" />

          <Stack spacing={3}>
            <Flex align="center" justify="space-between">
              <Text fontSize="md" fontWeight="600">
                Produtos
              </Text>
              <Text fontWeight="600">{formatCurrency(receipt.product.total)}</Text>
            </Flex>
            <Flex
              bg="gray.50"
              borderRadius="16px"
              border="1px solid"
              borderColor="gray.200"
              px={4}
              py={3}
              align="center"
              justify="space-between"
            >
              <Flex align="center" gap={3}>
                <Box
                  borderRadius="12px"
                  px={3}
                  py={1}
                  bg="purple.50"
                  border="1px solid"
                  borderColor="purple.200"
                >
                  <Text fontWeight="600">{receipt.product.quantity}</Text>
                </Box>
                <Text fontWeight="600">{receipt.product.name}</Text>
              </Flex>
              <Text fontWeight="600">{formatCurrency(receipt.product.total)}</Text>
            </Flex>
          </Stack>

          <Box mt={6} px={1}>
            <Flex align="center" justify="space-between" mb={3}>
              <Text fontSize="md" fontWeight="600">
                Pagamento
              </Text>
              <Badge colorScheme="yellow" variant="subtle" borderRadius="full" px={4} py={1}>
                {receipt.paymentStatusLabel}
              </Badge>
            </Flex>

            <Stack spacing={3}>
              {receipt.installments.map((installment) => (
                <Box
                  key={installment.id}
                  bg="gray.50"
                  borderRadius="18px"
                  border="1px solid"
                  borderColor="gray.200"
                  px={4}
                  py={3}
                >
                  <Flex align="flex-start" justify="space-between">
                    <Box>
                      <Badge
                        colorScheme={installmentBadgeColor(installment.status)}
                        variant="subtle"
                        borderRadius="full"
                        px={3}
                        py={1}
                      >
                        {installment.status}
                      </Badge>
                      <Text fontWeight="600" fontSize="lg" mt={2}>
                        {installment.title}
                      </Text>
                      <Text color="gray.500" fontSize="sm">
                        {installment.method}
                      </Text>
                    </Box>
                    <Box textAlign="right">
                      <Text fontWeight="600" fontSize="lg">
                        {formatCurrency(installment.amount)}
                      </Text>
                      <Text color="gray.500" fontSize="sm">
                        {formatDate(installment.date)}
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              ))}
            </Stack>

            <Box
              mt={4}
              bg="gray.50"
              borderRadius="18px"
              border="1px solid"
              borderColor="gray.200"
              px={4}
              py={3}
            >
              <Stack spacing={3}>
                {summaryRows.map((row) => {
                  const value = receipt.summary[row.key];
                  const label = row.label;
                  const isPositive = ['original', 'final', 'paid'].includes(row.key);
                  const isNegative = row.key === 'discount';
                  const formattedValue =
                    row.key === 'discount'
                      ? `-${formatCurrency(Math.abs(value))}`
                      : formatCurrency(value);
                  return (
                    <Flex key={row.key} justify="space-between" align="center">
                      <Text color="gray.600">{label}</Text>
                      <Text fontWeight={row.key === 'final' || row.key === 'paid' ? '600' : '500'}>
                        {formattedValue}
                      </Text>
                    </Flex>
                  );
                })}
              </Stack>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
