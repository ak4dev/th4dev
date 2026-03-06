// src/App.tsx
import React from 'react';
import { styled } from '../stitches.config';
import * as Icons from '@radix-ui/react-icons';

const Container = styled('div', {
  display: 'flex',
  height: '100vh',
  backgroundColor: '$background',
});

const Sidebar = styled('div', {
  width: 60,
  backgroundColor: '$currentLine',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '1rem 0',
});

const SidebarButton = styled('button', {
  all: 'unset',
  color: '$foreground',
  padding: '0.75rem',
  marginBottom: '0.5rem',
  cursor: 'pointer',
  borderRadius: 5,
  '&:hover': {
    backgroundColor: '$purple', // uses radix token purple9
  },
});

const Content = styled('div', {
  flex: 1,
  padding: '1rem',
});

export default function App() {
  return (
    <Container>
      <Content>
        <h1>Main Content</h1>
        <p>Right-sidebar Dracula themed layout using Radix themes!</p>
      </Content>
      <Sidebar>
        <SidebarButton>
          <Icons.FileIcon />
        </SidebarButton>
        <SidebarButton>
          <Icons.GearIcon />
        </SidebarButton>
        <SidebarButton>
          <Icons.PersonIcon />
        </SidebarButton>
      </Sidebar>
    </Container>
  );
}