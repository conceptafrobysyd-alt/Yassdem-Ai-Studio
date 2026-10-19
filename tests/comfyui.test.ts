import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ComfyUIProvider,
  prepareComfyWorkflow,
  validateComfyImage,
  validateComfyWorkflow,
} from '../src/lib/providers/comfyui';
import type { ComfyMode, ComfyWorkflow } from '../src/lib/providers/comfyui';
import {
  LocalServiceHttp,
  validateLocalServiceEndpoint,
} from '../src/lib/providers/local-http';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAjYAAAAASUVORK5CYII=',
  'base64',
);
function workflow(mode: ComfyMode = 'fashion-image', count = 1): ComfyWorkflow {
  const prompt: ComfyWorkflow['prompt'] = {
    text: {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: '{{prompt}}\n{{mannequin_parameters}}',
        width: '{{width}}',
        height: '{{height}}',
        seed: '{{seed}}',
      },
    },
  };
  for (let index = 1; index <= count; index++)
    prompt[`garment${index}`] = {
      class_type: 'LoadImage',
      inputs: { image: `{{garment_${index}}}` },
    };
  if (mode === 'try-on')
    prompt.model = {
      class_type: 'LoadImage',
      inputs: { image: '{{portrait_image}}' },
    };
  return { version: 1, mode, garmentSlots: count, prompt };
}
const input = {
  prompt: 'Photograph a blue dress',
  seed: 42,
  width: 1024,
  height: 1536,
  garmentImages: ['dress.png'],
  mannequinParameters: { skinTone: 'deep', hijab: true, heightCm: 172 },
};

afterEach(() => vi.unstubAllEnvs());

describe('explicit ComfyUI service transport', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://localhost/file',
    'http://169.254.169.254',
    'http://192.168.1.10:8188',
    'http://127.0.0.1.evil.test:8188',
    'https://user:secret@example.test',
    'http://localhost:8188/path',
    'http://localhost:8188?token=secret',
    'http://localhost:8188#fragment',
  ])('rejects an unsafe server endpoint %s', (endpoint) => {
    expect(() => validateLocalServiceEndpoint(endpoint)).toThrow(
      'COMFYUI_INVALID_ENDPOINT',
    );
  });
  it('allows exact loopback HTTP and an administrator configured TLS service', () => {
    for (const endpoint of [
      'http://127.0.0.1:8188',
      'http://localhost:8188',
      'http://[::1]:8188',
      'https://comfy.example.test',
    ])
      expect(validateLocalServiceEndpoint(endpoint).origin).toBe(endpoint);
  });
  it('does a bounded read-only connection check and rejects redirects', async () => {
    const fake = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ system: { comfyui_version: 'test' }, devices: [] }),
        ),
      );
    expect(
      await new ComfyUIProvider({ fetchImpl: fake }).checkConnection(),
    ).toEqual({ ok: true });
    expect(String(fake.mock.calls[0][0])).toBe(
      'http://127.0.0.1:8188/system_stats',
    );
    expect(fake.mock.calls[0][1].method).toBeUndefined();
    expect(fake.mock.calls[0][1].redirect).toBe('error');
    fake.mockImplementation(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254' },
        }),
      ),
    );
    expect(
      await new ComfyUIProvider({ fetchImpl: fake }).checkConnection(),
    ).toEqual({ ok: false, code: 'COMFYUI_REQUEST_FAILED' });
  });
  it('bounds chunked bodies and never exposes service error prose', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(100));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fake = vi.fn().mockResolvedValue(new Response(stream));
    const service = new LocalServiceHttp({
      endpoint: 'http://127.0.0.1:8188',
      fetchImpl: fake,
    });
    await expect(service.json('/system_stats', {}, 150)).rejects.toMatchObject({
      code: 'COMFYUI_RESPONSE_TOO_LARGE',
    });
    expect(cancelled).toBe(true);
    fake.mockResolvedValue(
      Response.json({ error: 'private provider traceback' }, { status: 500 }),
    );
    await expect(service.json('/system_stats')).rejects.toThrow(
      'COMFYUI_REQUEST_FAILED',
    );
    await expect(service.json('//attacker.test/private')).rejects.toThrow(
      'COMFYUI_INVALID_REQUEST',
    );
  });
});

describe('server-owned workflow capabilities', () => {
  it('injects typed values without evaluating user text or changing node keys', () => {
    const template = workflow();
    template.prompt.text = {
      ...(template.prompt.text as Record<string, string>),
      _meta: { title: 'Static text node', nested: { retained: true } },
    };
    const graph = prepareComfyWorkflow(template, {
      ...input,
      prompt: 'Literal {{garment_1}} and $shell',
    });
    expect(graph.garment1).toMatchObject({ inputs: { image: 'dress.png' } });
    expect(graph.text).toMatchObject({
      inputs: {
        seed: 42,
        width: 1024,
        height: 1536,
        text: 'Literal {{garment_1}} and $shell\n{"skinTone":"deep","hijab":true,"heightCm":172}',
      },
    });
    expect(template.prompt.garment1).toMatchObject({
      inputs: { image: '{{garment_1}}' },
    });
    expect(Object.keys(graph)).toEqual(Object.keys(template.prompt));
    for (const id of Object.keys(template.prompt)) {
      const { inputs: _before, ...before } = template.prompt[id] as Record<
        string,
        unknown
      >;
      const { inputs: _after, ...after } = graph[id] as Record<string, unknown>;
      expect(after).toEqual(before);
    }
  });
  it('rejects dynamic node classes and any placeholders outside node inputs', () => {
    const dynamicClass = workflow();
    dynamicClass.prompt.garment1 = {
      class_type: '{{mannequin.skinTone}}',
      inputs: { image: '{{garment_1}}' },
    };
    expect(() => validateComfyWorkflow(dynamicClass, 'fashion-image')).toThrow(
      'COMFYUI_INVALID_WORKFLOW',
    );
    expect(() => prepareComfyWorkflow(dynamicClass, input)).toThrow(
      'COMFYUI_INVALID_WORKFLOW',
    );
    const dynamicMetadata = workflow();
    dynamicMetadata.prompt.text = {
      class_type: 'Text',
      inputs: { text: '{{prompt}} {{mannequin_parameters}}' },
      _meta: { title: '{{prompt}}' },
    };
    expect(() =>
      validateComfyWorkflow(dynamicMetadata, 'fashion-image'),
    ).toThrow('COMFYUI_INVALID_WORKFLOW');
    expect(() =>
      validateComfyWorkflow(
        { ...workflow(), _meta: { title: '{{prompt}}' } },
        'fashion-image',
      ),
    ).toThrow('COMFYUI_INVALID_WORKFLOW');
    const misplacedRequiredToken = workflow();
    misplacedRequiredToken.prompt.text = {
      class_type: 'Text',
      inputs: { text: '{{mannequin_parameters}}' },
      _meta: { title: '{{prompt}}' },
    };
    expect(() =>
      validateComfyWorkflow(misplacedRequiredToken, 'fashion-image'),
    ).toThrow('COMFYUI_INVALID_WORKFLOW');
  });
  it('requires an explicit mapping for every garment and separate try-on capabilities', () => {
    expect(() =>
      prepareComfyWorkflow(workflow(), {
        ...input,
        garmentImages: ['top.png', 'bottom.png'],
      }),
    ).toThrow('COMFYUI_GARMENT_MAPPING_MISMATCH');
    const graph = prepareComfyWorkflow(workflow('fashion-image', 2), {
      ...input,
      garmentImages: ['top.png', 'bottom.png'],
    });
    expect(graph.garment2).toMatchObject({ inputs: { image: 'bottom.png' } });
    expect(() => prepareComfyWorkflow(workflow('try-on'), input)).toThrow(
      'COMFYUI_PORTRAIT_REQUIRED',
    );
    expect(
      prepareComfyWorkflow(workflow('try-on'), {
        ...input,
        portraitImage: 'portrait.png',
      }).model,
    ).toMatchObject({ inputs: { image: 'portrait.png' } });
    expect(() => validateComfyWorkflow(workflow(), 'try-on')).toThrow(
      'COMFYUI_INVALID_WORKFLOW',
    );
    const noPortrait = workflow('try-on');
    delete noPortrait.prompt.model;
    expect(() => validateComfyWorkflow(noPortrait, 'try-on')).toThrow(
      'COMFYUI_PORTRAIT_MAPPING_REQUIRED',
    );
  });
  it('supports a declared array input only when the graph explicitly accepts it', () => {
    const template = workflow();
    template.garmentSlots = 'array';
    template.prompt.garment1 = {
      class_type: 'CustomGarmentArray',
      inputs: { images: '{{garment_images}}' },
    };
    expect(
      prepareComfyWorkflow(template, {
        ...input,
        garmentImages: ['top.png', 'bottom.png'],
      }).garment1,
    ).toMatchObject({ inputs: { images: ['top.png', 'bottom.png'] } });
    template.prompt.garment1 = {
      class_type: 'LoadImage',
      inputs: { image: '{{garment_1}}' },
    };
    expect(() => validateComfyWorkflow(template, 'fashion-image')).toThrow(
      'COMFYUI_GARMENT_MAPPING_MISMATCH',
    );
  });
  it('requires model controls and rejects unknown tokens, key injection and prototype pollution', () => {
    const template = workflow();
    template.prompt.text = {
      class_type: 'Text',
      inputs: { text: '{{prompt}}' },
    };
    expect(() => validateComfyWorkflow(template, 'fashion-image')).toThrow(
      'COMFYUI_MODEL_MAPPING_REQUIRED',
    );
    const unknown = workflow();
    unknown.prompt.extra = {
      class_type: 'Text',
      inputs: { text: '{{arbitrary_file}}' },
    };
    expect(() => validateComfyWorkflow(unknown, 'fashion-image')).toThrow(
      'COMFYUI_UNKNOWN_PLACEHOLDER',
    );
    const polluted = JSON.parse(
      JSON.stringify(workflow()).replace(
        '"inputs":{',
        '"inputs":{"__proto__":{},',
      ),
    );
    expect(() => validateComfyWorkflow(polluted, 'fashion-image')).toThrow(
      'COMFYUI_INVALID_WORKFLOW',
    );
  });
  it('loads bounded local files and never accepts a workflow URL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yassdem-workflows-'));
    try {
      const fashion = join(dir, 'fashion.json');
      const tryOn = join(dir, 'try-on.json');
      await writeFile(fashion, JSON.stringify(workflow()));
      await writeFile(tryOn, JSON.stringify(workflow('try-on')));
      const provider = new ComfyUIProvider({
        fashionWorkflowPath: fashion,
        tryOnWorkflowPath: tryOn,
      });
      expect(await provider.loadWorkflow('fashion-image')).toMatchObject({
        mode: 'fashion-image',
        garmentSlots: 1,
      });
      expect(await provider.loadWorkflow('try-on')).toMatchObject({
        mode: 'try-on',
      });
      await expect(
        new ComfyUIProvider({
          fashionWorkflowPath: fashion,
          tryOnWorkflowPath: fashion,
        }).loadWorkflow('try-on'),
      ).rejects.toThrow('COMFYUI_SEPARATE_WORKFLOWS_REQUIRED');
      await writeFile(fashion, Buffer.alloc(1024 * 1024 + 1));
      await expect(provider.loadWorkflow('fashion-image')).rejects.toThrow(
        'COMFYUI_INVALID_WORKFLOW',
      );
      await expect(
        new ComfyUIProvider({
          fashionWorkflowPath: 'https://attacker.test/workflow.json',
        }).loadWorkflow('fashion-image'),
      ).rejects.toThrow('COMFYUI_INVALID_WORKFLOW');
      vi.stubEnv('COMFYUI_FASHION_WORKFLOW', '');
      await expect(
        new ComfyUIProvider().loadWorkflow('fashion-image'),
      ).rejects.toThrow('COMFYUI_FASHION_WORKFLOW_REQUIRED');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('ComfyUI upload, inference and history protocol — mocked, no GPU or API spend', () => {
  it('uploads multipart images and submits the API graph with a stable client ID', async () => {
    const fake = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          name: 'garment.png',
          subfolder: 'studio',
          type: 'input',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ prompt_id: 'task-123', node_errors: {} }),
      );
    const provider = new ComfyUIProvider({ fetchImpl: fake });
    const image = await provider.uploadImage(png, 'image/png', 'garment.png');
    expect(image).toBe('studio/garment.png');
    const form = fake.mock.calls[0][1].body as FormData;
    expect(form.get('image')).toBeInstanceOf(File);
    expect(form.get('type')).toBe('input');
    expect(form.get('overwrite')).toBe('false');
    const prompt = prepareComfyWorkflow(workflow(), {
      ...input,
      garmentImages: [image],
    });
    await expect(provider.createTask(prompt, 'job-123')).resolves.toEqual({
      id: 'task-123',
    });
    expect(String(fake.mock.calls[1][0])).toBe('http://127.0.0.1:8188/prompt');
    expect(JSON.parse(fake.mock.calls[1][1].body)).toEqual({
      prompt,
      client_id: 'job-123',
    });
  });
  it('polls exact history IDs and downloads only validated same-service descriptors', async () => {
    const image = {
      filename: 'result_00001.png',
      subfolder: 'fashion/final',
      type: 'output' as const,
    };
    const fake = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        Response.json({
          'task-123': {
            status: { completed: true, status_str: 'success' },
            outputs: { '9': { images: [image] } },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(png, { headers: { 'content-type': 'image/png' } }),
      );
    const provider = new ComfyUIProvider({ fetchImpl: fake });
    expect(await provider.getTask('task-123')).toEqual({ status: 'RUNNING' });
    expect(await provider.getTask('task-123')).toEqual({
      status: 'SUCCEEDED',
      images: [image],
    });
    expect(await provider.downloadImage(image)).toEqual(png);
    const url = fake.mock.calls[2][0] as URL;
    expect(url.origin).toBe('http://127.0.0.1:8188');
    expect(url.pathname).toBe('/view');
    expect(url.searchParams.get('filename')).toBe(image.filename);
    expect(url.searchParams.get('subfolder')).toBe('fashion/final');
  });
  it.each([
    { filename: '../secret.png', subfolder: '', type: 'output' },
    { filename: '/etc/passwd.png', subfolder: '', type: 'output' },
    { filename: 'secret.png', subfolder: '../private', type: 'output' },
    {
      filename: 'secret.png',
      subfolder: 'http://attacker.test',
      type: 'output',
    },
    { filename: 'secret.png', subfolder: '', type: 'input' },
    { filename: 'secret.svg', subfolder: '', type: 'output' },
    { filename: 'secret%2Fkey.png', subfolder: '', type: 'output' },
  ])('rejects unsafe descriptors without network access: %j', (image) => {
    expect(() => validateComfyImage(image)).toThrow('COMFYUI_INVALID_OUTPUT');
  });
  it('reports generation failures and rejects malformed completed history', async () => {
    const fake = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id1: {
            status: {
              completed: false,
              status_str: 'error',
              messages: [['execution_error', { secret: 'traceback' }]],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id1: { status: { completed: true }, outputs: {} } }),
      );
    const provider = new ComfyUIProvider({ fetchImpl: fake });
    expect(await provider.getTask('id1')).toEqual({ status: 'FAILED' });
    await expect(provider.getTask('id1')).rejects.toThrow(
      'COMFYUI_MISSING_OUTPUT',
    );
    await expect(provider.getTask('../../credentials')).rejects.toThrow(
      'COMFYUI_INVALID_TASK_ID',
    );
    expect(fake).toHaveBeenCalledTimes(2);
  });
});

describe('persisted ComfyUI job execution', () => {
  it('persists task IDs, imports real image bytes, and never repeats ambiguous submissions', async () => {
    const script = String.raw`
      import assert from 'node:assert/strict';
      import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
      import { join } from 'node:path';
      import { tmpdir } from 'node:os';
      import { DatabaseSync } from 'node:sqlite';
      import sharp from 'sharp';
      const dir = await mkdtemp(join(tmpdir(), 'yassdem-comfy-jobs-'));
      process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
      process.env.STORAGE_DIR = join(dir, 'storage');
      process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
      process.env.COMFYUI_FASHION_WORKFLOW = join(dir, 'fashion.json');
      process.env.COMFYUI_TRYON_WORKFLOW = join(dir, 'tryon.json');
      const baseGraph = {
        image: { class_type:'LoadImage', inputs:{image:'{{garment_1}}'} },
        text: { class_type:'Text', inputs:{text:'{{prompt}} {{mannequin_parameters}}'} }
      };
      await writeFile(process.env.COMFYUI_FASHION_WORKFLOW, JSON.stringify({version:1,mode:'fashion-image',garmentSlots:1,prompt:baseGraph}));
      await writeFile(process.env.COMFYUI_TRYON_WORKFLOW, JSON.stringify({version:1,mode:'try-on',garmentSlots:1,prompt:{...baseGraph, portrait:{class_type:'LoadImage',inputs:{image:'{{portrait_image}}'}}}}));
      const sqlite = new DatabaseSync(join(dir, 'test.db'));
      for (const migration of (await readdir('prisma/migrations', {withFileTypes:true})).filter(v=>v.isDirectory()).map(v=>v.name).sort())
        sqlite.exec(await readFile(join('prisma/migrations',migration,'migration.sql'),'utf8'));
      sqlite.close();
      await mkdir(join(dir,'storage/media'),{recursive:true});
      const png = await sharp({create:{width:64,height:96,channels:3,background:'#2345ab'}}).png().toBuffer();
      await writeFile(join(dir,'storage/media/source.png'),png);
      let posts = 0;
      let ambiguous = false;
      const oldFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const path = new URL(url).pathname;
        if (path === '/system_stats') return Response.json({system:{},devices:[]});
        if (path === '/upload/image') return Response.json({name:init.body.get('image').name,subfolder:'',type:'input'});
        if (path === '/prompt') { posts++; if (ambiguous) throw new Error('socket closed after possible acceptance'); return Response.json({prompt_id:'mock-task-1',node_errors:{}}); }
        if (path === '/history/mock-task-1') return Response.json({'mock-task-1':{status:{completed:true,status_str:'success'},outputs:{'1':{images:[{filename:'mock.png',subfolder:'',type:'output'}]}}}});
        if (path === '/view') return new Response(png,{headers:{'content-type':'image/png'}});
        throw new Error('Unexpected service route');
      };
      const {db} = await import('./src/lib/db.ts');
      const {enqueueFashionJob,processFashionJobs} = await import('./src/lib/fashion-jobs.ts');
      try {
        const project = await db.project.create({data:{name:'Isolated Comfy test',type:'fashion'}});
        const source = await db.media.create({data:{name:'Garment',path:'media/source.png',mimeType:'image/png',size:png.length}});
        const look = await db.look.create({data:{name:'Look',projectId:project.id,garmentMediaIds:JSON.stringify([source.id])}});
        await assert.rejects(enqueueFashionJob({lookId:look.id,mode:'try-on',idempotencyKey:'no-portrait'}),{code:'COMFYUI_PORTRAIT_REQUIRED'});
        assert.equal(posts,0);
        const job = await enqueueFashionJob({lookId:look.id,mode:'fashion-image',idempotencyKey:'stable-key'});
        assert.equal((await enqueueFashionJob({lookId:look.id,mode:'fashion-image',idempotencyKey:'stable-key'})).id,job.id);
        assert.equal(job.actualCostCents,0);
        assert.equal(job.reservedCents,0);
        await db.job.create({data:{projectId:project.id,sourceMediaId:source.id,provider:'comfyui',kind:'fashion_image',status:'SUBMITTING',providerRequested:true,parameters:job.parameters,budgetMonth:job.budgetMonth,idempotencyKey:'abandoned-before-id'}});
        await processFashionJobs();
        assert.equal((await db.job.findUniqueOrThrow({where:{idempotencyKey:'abandoned-before-id'}})).status,'UNKNOWN');
        let persisted = await db.job.findUniqueOrThrow({where:{id:job.id}});
        assert.equal(persisted.status,'RUNNING');
        assert.equal(persisted.providerTaskId,'mock-task-1');
        assert.equal(posts,1);
        await db.job.update({where:{id:job.id},data:{updatedAt:new Date(Date.now()-3000)}});
        await processFashionJobs();
        persisted = await db.job.findUniqueOrThrow({where:{id:job.id}});
        assert.equal(persisted.status,'SUCCEEDED');
        assert.equal(persisted.actualCostCents,0);
        assert.equal(persisted.reservedCents,0);
        const media = await db.media.findUniqueOrThrow({where:{id:persisted.outputMediaId}});
        assert.equal(media.width,64);
        assert.equal(media.height,96);
        assert.equal((await db.look.findUniqueOrThrow({where:{id:look.id}})).outputMediaId,media.id);
        assert.ok(JSON.parse((await db.project.findUniqueOrThrow({where:{id:project.id}})).parameters).fashionResultMediaIds.includes(media.id));
        const metadata = await sharp(await readFile(join(process.env.STORAGE_DIR,media.path))).metadata();
        assert.equal(metadata.format,'png');
        assert.equal(posts,1);
        const other = await db.look.create({data:{name:'Ambiguous look',projectId:project.id,garmentMediaIds:JSON.stringify([source.id])}});
        const unknown = await enqueueFashionJob({lookId:other.id,mode:'fashion-image',idempotencyKey:'ambiguous-key'});
        ambiguous = true;
        await processFashionJobs();
        assert.equal((await db.job.findUniqueOrThrow({where:{id:unknown.id}})).status,'UNKNOWN');
        await processFashionJobs();
        assert.equal(posts,2);
        process.stdout.write(JSON.stringify({persistedTask:true,importedImage:true,zeroCost:true,noDuplicateInference:true}));
      } finally {
        globalThis.fetch = oldFetch;
        await db.$disconnect();
        await rm(dir,{recursive:true,force:true});
      }
    `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(JSON.parse(stdout)).toEqual({
      persistedTask: true,
      importedImage: true,
      zeroCost: true,
      noDuplicateInference: true,
    });
  }, 35_000);
});
