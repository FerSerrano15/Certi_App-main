const ts = require('typescript');
const fs = require('fs');
const files = [
  'src/app/dashboard/landing-editor/landing-editor.component.ts',
  'src/app/pages/home/home.ts',
  'src/app/dashboard/dashboard.ts',
];
let ok = true;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const result = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
    reportDiagnostics: true,
    fileName: f,
  });
  if (result.diagnostics && result.diagnostics.length) {
    ok = false;
    console.log('=== ' + f + ' ===');
    for (const d of result.diagnostics) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const pos = d.file.getLineAndCharacterOfPosition(d.start);
        console.log(`  Line ${pos.line + 1}: ${msg}`);
      } else {
        console.log('  ' + msg);
      }
    }
  } else {
    console.log('OK: ' + f);
  }
}
process.exit(ok ? 0 : 1);
