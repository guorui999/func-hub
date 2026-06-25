from funchub.decorators import tool


class TestToolDecorator:
    def test_decorator_sets_funchub_tool(self):
        @tool(name="my_func", description="测试函数", author="tester", version="1.0.0")
        def my_func(url: str, timeout: int = 30) -> str:
            return url

        assert hasattr(my_func, "__funchub_tool__")
        td = my_func.__funchub_tool__
        assert td.name == "my_func"
        assert td.description == "测试函数"
        assert td.author == "tester"
        assert len(td.versions) == 1
        assert td.versions[0].version == "1.0.0"

    def test_decorator_auto_generates_schema(self):
        @tool()
        def search(query: str, limit: int = 10) -> list:
            return []

        td = search.__funchub_tool__
        assert "query" in td.parameters["properties"]
        assert "limit" in td.parameters["properties"]
        assert "query" in td.parameters["required"]
        assert "limit" not in td.parameters["required"]

    def test_decorator_infers_name_from_function(self):
        @tool()
        def my_custom_function_name(param1: str) -> str:
            return param1

        td = my_custom_function_name.__funchub_tool__
        assert td.name == "my_custom_function_name"

    def test_decorator_uses_docstring_as_description(self):
        @tool()
        def documented_func(x: int) -> int:
            return x * 2

        td = documented_func.__funchub_tool__
        assert td.description == "documented_func"

    def test_decorator_marks_prerelease(self):
        @tool(version="2.0.0-alpha.1")
        def alpha_func(x: int) -> int:
            return x

        td = alpha_func.__funchub_tool__
        assert td.versions[0].is_prerelease is True

    def test_decorator_no_prerelease_on_stable(self):
        @tool(version="1.0.0")
        def stable_func(x: int) -> int:
            return x

        td = stable_func.__funchub_tool__
        assert td.versions[0].is_prerelease is False
