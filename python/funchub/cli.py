import sys
from pathlib import Path
from typing import Optional

import click
import yaml

from funchub.client import FuncHub
from funchub.exceptions import ConflictError, FuncHubError, ToolNotFoundError, VersionNotFoundError
from funchub.github_client import load_config, save_config
from funchub.models import ToolDefinition, ToolVersion


@click.group()
@click.option("--registry", "-r", envvar="FUNCHUB_REGISTRY", help="中央索引 URL")
@click.option("--token", envvar="GITHUB_TOKEN", help="GitHub PAT")
@click.pass_context
def cli(ctx: click.Context, registry: Optional[str], token: Optional[str]) -> None:
    ctx.ensure_object(dict)
    ctx.obj["hub"] = FuncHub(registry=registry, token=token)


@cli.command()
@click.option("--token", required=True, help="GitHub Personal Access Token")
def login(token: str) -> None:
    cfg = load_config()
    cfg["github_token"] = token
    save_config(cfg)
    click.echo("GitHub Token 已保存到 ~/.funchub/config.yaml")


@cli.command()
@click.argument("key")
@click.argument("value")
def config(key: str, value: str) -> None:
    cfg = load_config()
    cfg[key] = value
    save_config(cfg)
    click.echo(f"配置项 {key} 已设置为 {value}")


@cli.command()
@click.option("--version", "ver", required=True, help="发布的版本号")
@click.option("--force", is_flag=True, help="覆盖同名工具")
@click.option("--dry-run", is_flag=True, help="预览不实际提交")
@click.pass_context
def publish(ctx: click.Context, ver: str, force: bool, dry_run: bool) -> None:
    hub: FuncHub = ctx.obj["hub"]
    tool_file = Path("funchub-tool.yaml")
    if not tool_file.exists():
        click.echo("错误: 当前目录未找到 funchub-tool.yaml", err=True)
        sys.exit(1)
    raw = tool_file.read_text(encoding="utf-8")
    data = yaml.safe_load(raw)
    is_prerelease = any(tag in ver.lower() for tag in ("alpha", "beta", "rc", "pre"))
    tv = ToolVersion(
        version=ver,
        source_repo=data.get("source_repo", ""),
        source_ref=data.get("source_ref", f"v{ver}"),
        dependencies=data.get("dependencies", []),
        is_prerelease=is_prerelease,
    )
    tool_def = ToolDefinition(
        name=data["name"],
        description=data.get("description", ""),
        parameters=data.get("parameters", {"type": "object", "properties": {}}),
        author=data.get("author", "anonymous"),
        entry_point=data.get("entry_point", "index:main"),
        versions=[tv],
    )
    try:
        result = hub.publish(tool_def, force=force, dry_run=dry_run)
        click.echo(f"发布成功: {result}")
    except ConflictError as e:
        click.echo(f"错误: {e}", err=True)
        sys.exit(1)
    except FuncHubError as e:
        click.echo(f"错误: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument("query")
@click.pass_context
def search(ctx: click.Context, query: str) -> None:
    hub: FuncHub = ctx.obj["hub"]
    results = hub.search(query)
    if not results:
        click.echo("未找到匹配的工具")
        return
    for t in results:
        click.echo(f"{t.name} - {t.description}")


@cli.command()
@click.argument("tool_spec")
@click.option("--prerelease", is_flag=True, help="包含预发布版本")
@click.option("--yes", is_flag=True, help="跳过安全确认")
@click.pass_context
def install(ctx: click.Context, tool_spec: str, prerelease: bool, yes: bool) -> None:
    hub: FuncHub = ctx.obj["hub"]
    constraint: Optional[str] = None
    tool_name = tool_spec
    if "@" in tool_spec:
        tool_name, constraint = tool_spec.split("@", 1)
    try:
        hub.install(
            tool_name,
            constraint=constraint,
            include_prerelease=prerelease,
            yes=yes,
        )
        click.echo(f"✅ 工具 {tool_name} 安装成功")
    except (ToolNotFoundError, VersionNotFoundError) as e:
        click.echo(f"错误: {e}", err=True)
        sys.exit(1)
    except FuncHubError as e:
        click.echo(f"错误: {e}", err=True)
        sys.exit(1)


@cli.command("list")
@click.pass_context
def list_tools(ctx: click.Context) -> None:
    hub: FuncHub = ctx.obj["hub"]
    items = hub.list_installed()
    if not items:
        click.echo("未安装任何工具")
        return
    for item in items:
        click.echo(f"{item['name']}@{item['version']} ({item['source_repo']})")


@cli.command()
@click.argument("name", required=False)
@click.option("--all", "update_all", is_flag=True, help="更新所有工具")
@click.option("--prerelease", is_flag=True, help="包含预发布版本")
@click.option("--yes", is_flag=True, help="跳过安全确认")
@click.pass_context
def update(
    ctx: click.Context,
    name: Optional[str],
    update_all: bool,
    prerelease: bool,
    yes: bool,
) -> None:
    hub: FuncHub = ctx.obj["hub"]
    if update_all:
        results = hub.update_all(include_prerelease=prerelease, yes=yes)
        if not results:
            click.echo("所有工具已是最新")
        for r in results:
            click.echo(r)
        return
    if not name:
        click.echo("请指定工具名称或使用 --all", err=True)
        sys.exit(1)
    try:
        result = hub.update(name, include_prerelease=prerelease, yes=yes)
        click.echo(f"✅ 工具 {name} 已更新到 {result}")
    except FuncHubError as e:
        click.echo(f"错误: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument("name")
@click.pass_context
def info(ctx: click.Context, name: str) -> None:
    hub: FuncHub = ctx.obj["hub"]
    tool_def = hub.info(name)
    if tool_def is None:
        click.echo(f"工具 '{name}' 未找到")
        return
    click.echo(f"名称: {tool_def.name}")
    click.echo(f"描述: {tool_def.description}")
    click.echo(f"作者: {tool_def.author}")
    click.echo(f"入口: {tool_def.entry_point}")
    click.echo("版本:")
    for v in tool_def.versions:
        pre = " (预发布)" if v.is_prerelease else ""
        click.echo(f"  - {v.version}{pre}")


@cli.command()
@click.argument("name")
@click.pass_context
def uninstall(ctx: click.Context, name: str) -> None:
    hub: FuncHub = ctx.obj["hub"]
    if hub.uninstall(name):
        click.echo(f"✅ 工具 {name} 已卸载")
    else:
        click.echo(f"工具 {name} 未安装")


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
