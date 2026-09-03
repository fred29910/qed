/**
 * About page.
 *
 * Shows the app icon, name, version, build info, credits, and a
 * read-only system info table. A "Open log folder" button hands off
 * to the OS file manager.
 */
import { Button, HStack, Text, VStack, type Widget } from 'perry/ui';
import { arch } from 'os';
import { describeEnvironment } from '../../app/app-controller.js';
import { Row, Section } from '../../ui/widgets.js';
import { paintMuted, paintText } from '../../ui/theme.js';
import { logger } from '../../diag.js';
import type { ShellService } from '../../services/shell-service.js';

/** Build the About view. */
export function AboutView(shell: ShellService): Widget {
    const env = describeEnvironment();

    const title = Text('qed');
    paintText(title);
    const version = Text('v0.1.0');
    const subtitle = Text('Cross-platform desktop application skeleton');
    paintMuted(subtitle);
    const madeWith = Text('Built with Perry.');
    paintMuted(madeWith);

    /* ---------------------------------------------------------------- *
     * Credits.                                                          *
     * ---------------------------------------------------------------- */
    const credits = [
        'Perry runtime (https://perryts.com)',
        'Perry UI / perry/ui',
        'Perry system bindings / perry/system',
    ].map((c) => {
        const t = Text(`• ${c}`);
        paintMuted(t);
        return t;
    });

    /* ---------------------------------------------------------------- *
     * System info.                                                      *
     * ---------------------------------------------------------------- */
    const platformRow = Row('Platform', Text(env.host));
    const archRow = Row('Architecture', Text(arch()));
    const execRow = Row('Executable', Text(process.execPath));
    const dataDirRow = Row('App data', Text(env.appDataDir));
    const logFileRow = Row('Log file', Text(logger.currentFilePath()));

    /* ---------------------------------------------------------------- *
     * Actions.                                                          *
     * ---------------------------------------------------------------- */
    const openLogBtn = Button('Open log folder', () => {
        shell.revealInFileManager(env.logDir);
    });
    const docsBtn = Button('Perry documentation', () => {
        shell.openUrl('https://docs.perryts.com/');
    });
    const actionRow = HStack(8, [openLogBtn, docsBtn]);

    return VStack(16, [
        VStack(4, [title, version, subtitle, madeWith]),
        Section('Credits', credits),
        Section('System info', [platformRow, archRow, execRow, dataDirRow, logFileRow]),
        actionRow,
    ]);
}
