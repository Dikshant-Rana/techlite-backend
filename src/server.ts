import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Storage, File as MegaFile } from 'megajs';

// Load environmental parameters securely
dotenv.config();

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

if (!MEGA_EMAIL || !MEGA_PASSWORD) {
  console.error('CRITICAL ERROR: Mega credentials missing inside .env context.');
  process.exit(1);
}

const app = express();

// Set Up Global Dynamic CORS Configuration
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// 1. Declare Shared UI Layout Interface Structure
export interface WebNode {
  id: string;
  name: string;
  isFolder: boolean;
  children?: WebNode[];
}

// Global reference holding our authenticated storage connection
let megaStorage: Storage | null = null;

/**
 * Instantiates connection to MEGA account during initialization sequence
 */
async function initializeMegaStorage(): Promise<Storage> {
  return new Promise((resolve, reject) => {
    console.log('Connecting to remote storage master server...');
    
    const storage = new Storage({
      email: MEGA_EMAIL || '',
      password: MEGA_PASSWORD || '',
      autologin: true
    }, (err) => {
      if (err) {
        return reject(err);
      }
      console.log('Successfully mapped encrypted storage target link cluster.');
      resolve(storage);
    });
  });
}

/**
 * Recursive utility to build a sanitized clean representation of folders and sub-nodes
 */
function mapMegaNode(node: MegaFile): WebNode | null {
  // Ensure the node and its name exist
  if (!node || !node.name) {
    return null;
  }

  // Fallback to node.name if nodeId is undefined, satisfying strict string assignment
  const nodeId = node.nodeId || node.name;

  const isFolder = node.directory;
  const result: WebNode = {
    id: nodeId, // <-- TypeScript is happy now!
    name: node.name,
    isFolder: isFolder
  };

  if (isFolder && node.children) {
    const formattedChildren: WebNode[] = [];
    for (const child of node.children) {
      const parsedChild = mapMegaNode(child);
      if (parsedChild) {
        formattedChildren.push(parsedChild);
      }
    }
    result.children = formattedChildren;
  }

  return result;
}

// Ensure server startup delays route accessibility until authorization settles
(async () => {
  try {
    megaStorage = await initializeMegaStorage();
    
    // Start Listening for UI Client Hooks
    app.listen(PORT, () => {
      console.log(`[TechLite OS Gateway Server] Active on port ${PORT}`);
    });
  } catch (error) {
    console.error('Initialization Fault: Unable to sync server state securely.', error);
    process.exit(1);
  }
})();

// Helper middleware guarding references from runtime structural exceptions
const verifyStorageReady = (_req: Request, res: Response, next: NextFunction): void => {
  if (!megaStorage) {
    res.status(503).json({ error: 'Storage synchronization state is currently detached.' });
    return;
  }
  next();
};

/**
 * ROUTE: GET /api/tree
 * Returns a fully computed visual folder tree scheme
 */
app.get('/api/tree', verifyStorageReady, (_req: Request, res: Response) => {
  try {
    if (!megaStorage || !megaStorage.root) {
      res.status(500).json({ error: 'Data bridge state error: master directory missing root target' });
      return;
    }

    const treeStructure: WebNode[] = [];
    
    // Evaluate top layer files and sub-folders
    if (megaStorage.root.children) {
      for (const topNode of megaStorage.root.children) {
        const mapped = mapMegaNode(topNode);
        if (mapped) {
          treeStructure.push(mapped);
        }
      }
    }

    res.status(200).json(treeStructure);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown compilation exception';
    res.status(500).json({ error: `Failed to compile runtime tree hierarchy: ${message}` });
  }
});

/**
 * ROUTE: GET /api/retrieve/:fileId
 * Streams the secure file from MEGA down to the browser response via piping
 */
/**
 * ROUTE: GET /api/retrieve/:fileId
 * Streams the secure file from MEGA down to the browser response via piping
 */
app.get('/api/retrieve/:fileId', verifyStorageReady, (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    if (!megaStorage) return;

    // Direct O(1) fast lookup from the global authenticated node list hash map
    let targetNode = megaStorage.files[fileId];

    // Fallback: If hash map isn't completely indexed, perform a recursive deep search from root
    if (!targetNode && megaStorage.root) {
      const searchTree = (node: any): any => {
        if (node.nodeId === fileId) return node;
        if (node.children) {
          for (const child of node.children) {
            const found = searchTree(child);
            if (found) return found;
          }
        }
        return null;
      };
      targetNode = searchTree(megaStorage.root);
    }

    if (!targetNode) {
      res.status(404).json({ error: 'Requested item does not exist inside repository structure.' });
      return;
    }

    if (targetNode.directory) {
      res.status(400).json({ error: 'Direct link stream cannot target folder structures.' });
      return;
    }

    // Set high performance browser headers for continuous streaming
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(targetNode.name || 'payload.bin')}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    if (targetNode.size) {
      res.setHeader('Content-Length', targetNode.size);
    }

    // Instantiate download stream
    const downloadStream = targetNode.download();

    downloadStream.on('error', (streamErr: any) => {
      console.error(`Pipeline transmission interrupt encountered for token id ${fileId}:`, streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Direct byte storage allocation channel failed mid-transit.' });
      }
    });

    // Directly bind the stream pipe down into the express response box
    downloadStream.pipe(res);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal pipeline fault';
    if (!res.headersSent) {
      res.status(500).json({ error: `Secure cluster routing exception: ${message}` });
    }
  }
});