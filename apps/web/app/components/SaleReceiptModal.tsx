'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs
} from '@chakra-ui/react';
import { CloseIcon, DownloadIcon, PrintIcon } from '@chakra-ui/icons';
import { useState } from 'react';
import DigitalReceipt, { MOCK_DIGITAL_RECEIPT } from './receipts/DigitalReceipt';
import ThermalReceipt from './receipts/ThermalReceipt';

type SaleReceiptModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SaleReceiptModal({ isOpen, onClose }: SaleReceiptModalProps) {
  const [tabIndex, setTabIndex] = useState(0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      size="2xl"
      scrollBehavior="inside"
      motionPreset="slideInBottom"
    >
      <ModalOverlay
        bg="blackAlpha.600"
        display="flex"
        alignItems="center"
        justifyContent="center"
      />
      <ModalContent
        maxW="640px"
        maxH="90vh"
        borderRadius="3xl"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        alignItems="center"
      >
        <ModalHeader pb={2} pt={6} px={6}>
          <Flex align="center" justify="space-between" w="full">
            <Heading size="lg">Extrato da venda</Heading>
            <IconButton
              aria-label="Fechar"
              icon={<CloseIcon />}
              variant="ghost"
              onClick={onClose}
              size="md"
            />
          </Flex>
        </ModalHeader>

        <ModalBody
          px={6}
          pb={0}
          pt={0}
          flex="1"
          display="flex"
          flexDirection="column"
          overflow="hidden"
          alignItems="center"
        >
          <Tabs
            index={tabIndex}
            onChange={(index) => setTabIndex(index)}
            variant="unstyled"
            height="100%"
            display="flex"
            flexDirection="column"
          >
            <TabList
              gap={3}
              p={2}
              borderRadius="18px"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              boxShadow="0 8px 24px rgba(15, 23, 42, 0.12)"
              w="full"
            >
              <Tab
                flex={1}
                borderRadius="14px"
                fontSize="md"
                fontWeight="600"
                py={3}
                bg="purple.500"
                color="white"
                _selected={{
                  bg: 'purple.500',
                  color: 'white',
                  boxShadow: '0 12px 24px rgba(124,58,237,0.25)'
                }}
                border="1px solid"
                borderColor="transparent"
              >
                Digital
              </Tab>
              <Tab
                flex={1}
                borderRadius="14px"
                fontSize="md"
                fontWeight="600"
                py={3}
                bg="white"
                color="purple.600"
                _selected={{
                  bg: 'purple.500',
                  color: 'white',
                  boxShadow: '0 12px 24px rgba(124,58,237,0.25)'
                }}
                border="1px solid"
                borderColor="purple.500"
              >
                Térmico
              </Tab>
            </TabList>

            <TabPanels
              flex="1"
              mt={4}
              overflow="hidden"
              display="flex"
              flexDirection="column"
              w="100%"
            >
              <TabPanel p={0} h="100%">
                <Box h="100%" overflowY="auto" pr={2} w="100%" display="flex" justifyContent="center">
                  <DigitalReceipt receipt={MOCK_DIGITAL_RECEIPT} />
                </Box>
              </TabPanel>
              <TabPanel p={0} h="100%">
                <Box h="100%" overflowY="auto" pr={2} w="100%" display="flex" justifyContent="center">
                  <ThermalReceipt />
                </Box>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>

        <ModalFooter
          position="sticky"
          bottom={0}
          left={0}
          right={0}
          borderTop="1px solid"
          borderColor="gray.200"
          bg="white"
          px={6}
          py={4}
          gap={3}
        >
          <Button
            leftIcon={<DownloadIcon />}
            size="lg"
            flex={1}
            borderRadius="16px"
            fontWeight="600"
            color="white"
            bgGradient="linear(to-r,#A236F3,#7B2EF3)"
            _hover={{ opacity: 0.9 }}
            boxShadow="0 12px 24px rgba(124,58,237,0.2)"
          >
            Baixar
          </Button>
          <Button
            leftIcon={<PrintIcon />}
            variant="outline"
            colorScheme="purple"
            size="lg"
            flex={1}
            borderRadius="16px"
            fontWeight="600"
            borderWidth={2}
          >
            Imprimir
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
