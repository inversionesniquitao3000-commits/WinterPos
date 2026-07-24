const fs = require('fs');
const file = 'src/components/ConfiguracionEmpresa.tsx';
let content = fs.readFileSync(file, 'utf8');

const s1 = `        {activeTab === 'db' && isAdmin && (
          <div className="space-y-6 max-w-4xl mx-auto">
            
            {/* WIPE SYSTEM */}`;

const r1 = `        {activeTab === 'db' && isAdmin && (
          <div className="space-y-6 w-full px-2 lg:px-4 mx-auto animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: DANGER ZONE */}
              <div className="lg:col-span-6 space-y-6">
            
            {/* WIPE SYSTEM */}`;

const s2 = `              </div>
            </div>

            {/* BACKUPS & EXPORT/IMPORT */}`;

const r2 = `              </div>
            </div>
            </div>

            {/* RIGHT COLUMN: BACKUPS & AUTOMATIC BACKUP */}
            <div className="lg:col-span-6 space-y-6">
            {/* BACKUPS & EXPORT/IMPORT */}`;

const s3 = `              </div>
            </div>

          </div>
        )}`;

const r3 = `              </div>
            </div>
            </div>
          </div>
        )}`;

content = content.replace(s1, r1);
content = content.replace(s2, r2);
content = content.replace(s3, r3);

fs.writeFileSync(file, content);
console.log("Replaced!");
