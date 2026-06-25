// T6 — Project routes (owner-scoped). ownerId LẤY TỪ SESSION (không từ client) — chống IDOR/mass assignment.
import { Response, Router } from 'express';
import { RegistryService } from '../application/registryService';
import { reviewHistoryRepository } from '../adapters/mongo/reviewHistoryRepository';
import { catalog } from '../config/catalog';
import { AuthedRequest } from './middleware';

/** Lọc allowlist field từ body (chống mass assignment: bỏ ownerId, id, ...). */
function pickCreate(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? ''),
    repoUrl: String(body.repoUrl ?? ''),
    azureProject: body.azureProject != null ? String(body.azureProject) : undefined,
    model: body.model != null ? String(body.model) : undefined,
    effort: body.effort != null ? String(body.effort) : undefined,
    docSources: Array.isArray(body.docSources) ? body.docSources.map(String) : undefined,
    claudeApiKey: String(body.claudeApiKey ?? ''),
    azurePat: String(body.azurePat ?? ''),
  };
}

function pickUpdate(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.name != null) out.name = String(body.name);
  if (body.repoUrl != null) out.repoUrl = String(body.repoUrl);
  if (body.azureProject != null) out.azureProject = String(body.azureProject);
  if (body.model != null) out.model = String(body.model);
  if (body.effort != null) out.effort = String(body.effort);
  if (Array.isArray(body.docSources)) out.docSources = body.docSources.map(String);
  if (body.status != null) out.status = String(body.status);
  if (body.claudeApiKey != null && String(body.claudeApiKey) !== '') out.claudeApiKey = String(body.claudeApiKey);
  if (body.azurePat != null && String(body.azurePat) !== '') out.azurePat = String(body.azurePat);
  return out;
}

export function projectRoutes(registry: RegistryService): Router {
  const r = Router();

  r.get('/meta/models', (_req, res: Response) => res.json(catalog()));

  r.get('/projects', async (req: AuthedRequest, res, next) => {
    try {
      res.json(await registry.list(req.owner!.ownerId));
    } catch (e) {
      next(e);
    }
  });

  r.post('/projects', async (req: AuthedRequest, res, next) => {
    try {
      const created = await registry.create(req.owner!.ownerId, pickCreate(req.body ?? {}));
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  });

  r.get('/projects/:id', async (req: AuthedRequest, res, next) => {
    try {
      res.json(await registry.get(req.params.id, req.owner!.ownerId)); // 404 nếu không thuộc owner
    } catch (e) {
      next(e);
    }
  });

  r.put('/projects/:id', async (req: AuthedRequest, res, next) => {
    try {
      res.json(await registry.update(req.params.id, req.owner!.ownerId, pickUpdate(req.body ?? {})));
    } catch (e) {
      next(e);
    }
  });

  r.delete('/projects/:id', async (req: AuthedRequest, res, next) => {
    try {
      await registry.remove(req.params.id, req.owner!.ownerId);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.post('/projects/:id/test-connection', async (req: AuthedRequest, res, next) => {
    try {
      const b = req.body ?? {};
      const result = await registry.testConnection({
        repoUrl: String(b.repoUrl ?? ''),
        azurePat: String(b.azurePat ?? ''),
        claudeApiKey: String(b.claudeApiKey ?? ''),
      });
      res.json(result); // chỉ pass/fail từng phần, không lộ giá trị
    } catch (e) {
      next(e);
    }
  });

  r.get('/projects/:id/reviews', async (req: AuthedRequest, res, next) => {
    try {
      await registry.get(req.params.id, req.owner!.ownerId); // đảm bảo project thuộc owner trước
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const beforeId = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = await reviewHistoryRepository.listByProjectOwned(req.params.id, req.owner!.ownerId, {
        limit,
        beforeId,
      });
      res.json(page);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
