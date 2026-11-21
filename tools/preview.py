#!/usr/bin/env python3
"""Launch an isolated interactive MDK preview, or hot-update only that preview."""
import argparse,ast,configparser,json,os,shutil,subprocess,time
from pathlib import Path
source=Path(__file__).resolve().parent.parent
root=Path(os.environ.get('APP_LIBRARY_PREVIEW_ROOT',str(Path.home()/'.private/State/app-library/devkit')))
parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['launch','update','capture','open','close','page','identity','test']);parser.add_argument('value',nargs='?');parser.add_argument('--headless',action='store_true');args=parser.parse_args()
root.mkdir(parents=True,exist_ok=True)
if args.operation!='launch':
    sequence=time.time_ns()
    request={'op':'reload' if args.operation=='update' else args.operation,'sequence':sequence}
    if args.operation=='update':
        subprocess.run([str(next(Path('/nix/store').glob('*-glib-*-dev/bin/glib-compile-schemas'))),str(source/'schemas')],check=True)
        revision=time.time_ns()//1_000_000;dest=root/f'updates/{revision}';shutil.copytree(source,dest,ignore=shutil.ignore_patterns('.git','tools','tests'));request['revision']=revision
    if args.operation in ('open','identity'):request['category']=args.value
    if args.operation=='test':request['module']=(source/'tests'/f'{args.value}.js').as_uri()
    if args.operation=='page':request['page']=int(args.value or 0)
    (root/'request.json').write_text(json.dumps(request));print('Preview request:',request);raise SystemExit
(root/'request.json').unlink(missing_ok=True)
for name in ['home','data/applications','data/gnome-shell/extensions','system-data/gnome-shell/modes','config','cache','state','runtime']:(root/name).mkdir(parents=True,exist_ok=True)
(root/'runtime').chmod(0o700)
compiler=next(Path('/nix/store').glob('*-glib-*-dev/bin/glib-compile-schemas'))
subprocess.run([str(compiler),str(source/'schemas')],check=True)
uuid='app-library@neg-zero.com';extension=root/'data/gnome-shell/extensions'/uuid
if extension.exists():shutil.rmtree(extension)
shutil.copytree(source,extension,ignore=shutil.ignore_patterns('.git','tools','tests'))
mode='app-library-preview'
metadata=json.loads((extension/'metadata.json').read_text());metadata['session-modes']=['user',mode];(extension/'metadata.json').write_text(json.dumps(metadata))
setup=root/'data/gnome-shell/extensions/app-library-preview@zenos.test';setup.mkdir(exist_ok=True)
(setup/'metadata.json').write_text(json.dumps({'uuid':setup.name,'name':'App Library preview','description':'Private interactive preview fixture','shell-version':['50'],'session-modes':['user',mode]}))
shutil.copyfile(source/'tools/preview-setup.js',setup/'extension.js')
(root/f'system-data/gnome-shell/modes/{mode}.json').write_text(json.dumps({'parentMode':'user','isPrimary':True,'enabledExtensions':([uuid,setup.name]+(['blur-my-shell@aunetx'] if (root/'data/gnome-shell/extensions/blur-my-shell@aunetx').exists() else [])),'components':[],'showWelcomeDialog':False}))
original_data=[os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')),*os.environ.get('XDG_DATA_DIRS','/run/current-system/sw/share').split(':')]
providers=[];seen=set();count=0
notify=shutil.which('notify-send') or str(next(Path('/nix/store').glob('*-libnotify-*/bin/notify-send')))
for index,directory in enumerate(original_data):
    directory=Path(directory)
    icons=directory/'icons'
    if icons.is_dir():
        provider=root/f'system-data/icons-{index}';provider.mkdir(exist_ok=True);link=provider/'icons'
        if not link.exists():link.symlink_to(icons)
        providers.append(str(provider))
    for path in (directory/'applications').glob('*.desktop'):
        if path.name in seen:continue
        seen.add(path.name)
        entry=configparser.ConfigParser(interpolation=None,strict=False)
        try:entry.read(path)
        except configparser.Error:continue
        if 'Desktop Entry' not in entry:continue
        original=entry['Desktop Entry']
        if original.get('NoDisplay','false').lower()=='true' or original.get('Hidden','false').lower()=='true':continue
        fixture=configparser.ConfigParser(interpolation=None);fixture.optionxform=str
        fixture['Desktop Entry']={'Type':'Application','Name':original.get('Name',path.stem),'Icon':original.get('Icon','application-x-executable'),'Categories':original.get('Categories',''),'Exec':f'{notify} "App Library preview" "App selected"','StartupNotify':'false'}
        with (root/'data/applications'/path.name).open('w') as f:fixture.write(f,space_around_delimiters=False)
        count+=1
settings={}
for key,schema in [('iconTheme','icon-theme'),('accent','accent-color')]:settings[key]=ast.literal_eval(subprocess.check_output(['gsettings','get','org.gnome.desktop.interface',schema],text=True))
settings['favorites']=ast.literal_eval(subprocess.check_output(['gsettings','get','org.gnome.shell','favorite-apps'],text=True));(root/'settings.json').write_text(json.dumps(settings))
env=os.environ.copy();real_runtime=env.get('XDG_RUNTIME_DIR','/run/user/1000')
env.update({'HOME':str(root/'home'),'XDG_DATA_HOME':str(root/'data'),'XDG_CONFIG_HOME':str(root/'config'),'XDG_STATE_HOME':str(root/'state'),'XDG_CACHE_HOME':str(root/'cache'),'XDG_DATA_DIRS':':'.join([str(root/'system-data'),*providers]),'GSETTINGS_BACKEND':'memory','APP_LIBRARY_PREVIEW_ROOT':str(root),'WAYLAND_DISPLAY':str(Path(real_runtime)/env.get('WAYLAND_DISPLAY','wayland-0')),'XDG_RUNTIME_DIR':str(root/'runtime'),'PIPEWIRE_RUNTIME_DIR':real_runtime,'GTK_A11Y':'none','NO_AT_BRIDGE':'1','GIO_USE_VFS':'local'})
with (root/'shell.log').open('w') as log:
    process=subprocess.Popen(['dbus-run-session','--','gnome-shell',*(['--headless','--virtual-monitor=1920x1080'] if args.headless else ['--devkit']),'--no-x11',f'--mode={mode}',f'--wayland-display=app-library-{os.getpid()}'],env=env,stdout=log,stderr=log,start_new_session=True)
(root/'launcher.json').write_text(json.dumps({'pid':process.pid,'root':str(root),'source':str(source)}));print('App Library MDK launched:',process.pid,'safe launchers:',count)
